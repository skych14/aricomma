"""관리자 사용자 관리 — 목록/검색, 정지·인증 상태 변경, 계정 삭제."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.reservation import Reservation
from models.usage_log import UsageLog
from models.user import User
from models.verification import VerificationRequest
from schemas.user import AdminUserResponse, AdminUserUpdate
from utils.audit import write_audit
from utils.auth import get_current_admin
from utils.upload_files import delete_upload

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])

STATUS_FILTERS = ("verified", "unverified", "suspended")


@router.get("", response_model=List[AdminUserResponse])
def list_users(
    q: Optional[str] = None,
    status: Optional[str] = Query(None, description="verified | unverified | suspended"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if status and status not in STATUS_FILTERS:
        raise HTTPException(
            status_code=400, detail=f"status는 {', '.join(STATUS_FILTERS)} 중 하나여야 합니다"
        )

    # 예약 건수는 사용자별 집계로 한 번에 가져온다 (N+1 방지)
    counts = dict(
        db.query(Reservation.user_id, func.count(Reservation.id))
        .group_by(Reservation.user_id)
        .all()
    )

    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(User.name.like(like), User.student_id.like(like), User.email.like(like))
        )
    if status == "verified":
        query = query.filter(User.is_verified.is_(True))
    elif status == "unverified":
        query = query.filter(User.is_verified.is_(False))
    elif status == "suspended":
        query = query.filter(User.is_suspended.is_(True))

    users = query.order_by(User.created_at.desc()).all()
    return [
        AdminUserResponse(
            id=u.id,
            email=u.email,
            name=u.name,
            student_id=u.student_id,
            role=u.role,
            is_verified=u.is_verified,
            is_suspended=u.is_suspended,
            created_at=u.created_at,
            reservation_count=counts.get(u.id, 0),
        )
        for u in users
    ]


def _get_target(db: Session, user_id: str, current_admin: User) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="본인 계정은 변경할 수 없습니다")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="관리자 계정은 변경할 수 없습니다")
    return user


@router.patch("/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: str,
    body: AdminUserUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _get_target(db, user_id, current_admin)

    if body.is_suspended is None and body.is_verified is None:
        raise HTTPException(status_code=400, detail="변경할 항목이 없습니다")

    changes = {}
    if body.is_suspended is not None and body.is_suspended != user.is_suspended:
        changes["is_suspended"] = body.is_suspended
        user.is_suspended = body.is_suspended
    if body.is_verified is not None and body.is_verified != user.is_verified:
        changes["is_verified"] = body.is_verified
        user.is_verified = body.is_verified

    if changes:
        user.updated_at = datetime.utcnow()
        db.commit()
        write_audit(
            db,
            action_type="USER_UPDATE",
            actor_id=current_admin.id,
            target_type="user",
            target_id=user.id,
            detail={"student_id": user.student_id, **changes},
            ip_address=request.client.host if request.client else None,
            commit=True,
        )
        db.refresh(user)

    count = (
        db.query(func.count(Reservation.id)).filter(Reservation.user_id == user.id).scalar()
    )
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        student_id=user.student_id,
        role=user.role,
        is_verified=user.is_verified,
        is_suspended=user.is_suspended,
        created_at=user.created_at,
        reservation_count=count or 0,
    )


@router.delete("/{user_id}", status_code=200)
def delete_user(
    user_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """계정과 관련 기록을 삭제한다.

    남의 학번을 선점한 계정을 풀어주기 위한 기능이라
    학번 unique 제약이 즉시 풀리도록 사용자 행 자체를 지운다.
    감사 로그는 남기고, 삭제된 계정의 학번·이메일을 detail에 기록한다.
    """
    user = _get_target(db, user_id, current_admin)

    active = (
        db.query(Reservation)
        .filter(Reservation.user_id == user.id, Reservation.status == "checked_in")
        .first()
    )
    if active:
        raise HTTPException(status_code=400, detail="이용 중인 예약이 있어 삭제할 수 없습니다")

    snapshot = {"name": user.name, "student_id": user.student_id, "email": user.email}

    verifications = (
        db.query(VerificationRequest).filter(VerificationRequest.user_id == user.id).all()
    )
    for v in verifications:
        delete_upload(v.file_path)
        db.delete(v)

    usage_count = (
        db.query(UsageLog).filter(UsageLog.user_id == user.id).delete(synchronize_session=False)
    )
    reservation_count = (
        db.query(Reservation)
        .filter(Reservation.user_id == user.id)
        .delete(synchronize_session=False)
    )
    db.delete(user)
    db.commit()

    write_audit(
        db,
        action_type="USER_DELETE",
        actor_id=current_admin.id,
        target_type="user",
        target_id=user_id,
        detail={
            **snapshot,
            "reservations_deleted": reservation_count,
            "usage_logs_deleted": usage_count,
            "verifications_deleted": len(verifications),
        },
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return {
        "deleted": True,
        "student_id": snapshot["student_id"],
        "email": snapshot["email"],
        "reservations_deleted": reservation_count,
        "usage_logs_deleted": usage_count,
        "verifications_deleted": len(verifications),
    }
