"""관리자 사용자 관리 — 목록/검색, 정지·인증 상태 변경, 계정 삭제."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.audit_log import AuditLog
from models.reservation import Reservation
from models.user import User
from schemas.user import (
    AdminUserResponse,
    AdminUserUpdate,
    LoginEventResponse,
    TempPasswordResponse,
)
from utils.account import purge_user
from utils.audit import write_audit
from utils.auth import get_current_admin, hash_password
from utils.password_policy import generate_temp_password
from utils.penalty import counter_reset_at, penalty_counts
from utils.rate_limit import client_ip

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])

STATUS_FILTERS = ("verified", "unverified", "suspended")
# 사용자 화면의 "로그인 기록"에 보여줄 감사 로그 종류
LOGIN_EVENT_TYPES = ("USER_LOGIN", "LOGIN_FAILED", "LOGIN_LOCKED")
LOGIN_EVENT_LIMIT = 50


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
        term = q.strip()
        # 저장 형태에 맞춰 검색어를 바꾼다 — 이메일은 소문자, 학번은 대문자
        # (schemas.normalize_email / normalize_student_id)
        query = query.filter(
            or_(
                User.name.like(f"%{term}%"),
                User.student_id.like(f"%{term.upper()}%"),
                User.email.like(f"%{term.lower()}%"),
            )
        )
    if status == "verified":
        query = query.filter(User.is_verified.is_(True))
    elif status == "unverified":
        query = query.filter(User.is_verified.is_(False))
    elif status == "suspended":
        query = query.filter(User.is_suspended.is_(True))

    users = query.order_by(User.created_at.desc()).all()
    penalties = penalty_counts(db, [u.id for u in users], counter_reset_at(db))
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
            penalty_count=penalties.get(u.id, 0),
            suspended_until=u.suspended_until,
            locked_until=u.locked_until,
            must_change_password=bool(u.must_change_password),
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
        if not body.is_suspended:
            # 수동 해제 시 패널티로 잡힌 해제 예정일도 함께 비운다
            user.suspended_until = None
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
        penalty_count=penalty_counts(db, [user.id], counter_reset_at(db)).get(user.id, 0),
        suspended_until=user.suspended_until,
        locked_until=user.locked_until,
        must_change_password=bool(user.must_change_password),
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
    counts = purge_user(db, user)
    db.commit()

    write_audit(
        db,
        action_type="USER_DELETE",
        actor_id=current_admin.id,
        target_type="user",
        target_id=user_id,
        detail={**snapshot, **counts},
        ip_address=client_ip(request),
        commit=True,
    )
    return {
        "deleted": True,
        "student_id": snapshot["student_id"],
        "email": snapshot["email"],
        **counts,
    }


@router.post("/{user_id}/temp-password", response_model=TempPasswordResponse)
def issue_temp_password(
    user_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """임시 비밀번호를 발급한다. 값은 이 응답에서 딱 한 번만 나가고 DB에는 해시만 남는다.

    본인·다른 관리자는 대상이 될 수 없다(_get_target). 발급하면 기존 토큰이 모두
    끊기고, 새 비밀번호로 바꾸기 전까지 다른 API는 막힌다.
    """
    user = _get_target(db, user_id, current_admin)

    temp = generate_temp_password()
    now = datetime.utcnow()
    user.hashed_password = hash_password(temp)
    user.must_change_password = True
    user.token_version = (user.token_version or 0) + 1
    # 잠겨 있었다면 함께 풀어준다 — 임시 비밀번호로 바로 들어올 수 있어야 하므로
    user.failed_login_count = 0
    user.locked_until = None
    user.updated_at = now
    db.commit()
    db.refresh(user)

    # 비밀번호 자체는 절대 기록하지 않는다
    write_audit(
        db,
        action_type="USER_TEMP_PASSWORD",
        actor_id=current_admin.id,
        target_type="user",
        target_id=user.id,
        detail={"student_id": user.student_id},
        ip_address=client_ip(request),
        commit=True,
    )
    return TempPasswordResponse(
        user_id=user.id, student_id=user.student_id, temp_password=temp
    )


@router.get("/{user_id}/login-events", response_model=List[LoginEventResponse])
def login_events(
    user_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """그 사용자의 최근 로그인 성공·실패·잠금 기록."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.actor_id == user.id,
            AuditLog.action_type.in_(LOGIN_EVENT_TYPES),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(LOGIN_EVENT_LIMIT)
        .all()
    )
    return [
        LoginEventResponse(
            id=r.id,
            action_type=r.action_type,
            ip_address=r.ip_address,
            detail=r.detail,
            created_at=r.created_at,
        )
        for r in rows
    ]
