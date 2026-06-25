import uuid
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.reservation import Reservation
from models.seat import Seat
from models.usage_log import UsageLog
from models.user import User
from schemas.reservation import (
    CheckinRequest,
    ReservationCreate,
    ReservationDetail,
    ReservationResponse,
)
from utils.audit import write_audit
from utils.auth import get_active_student, get_current_admin, get_current_user
from utils.expiry import expire_pending_reservations

router = APIRouter(tags=["reservations"])


def _build_detail(r: Reservation, db: Session) -> ReservationDetail:
    seat = db.query(Seat).filter(Seat.id == r.seat_id).first()
    return ReservationDetail(
        id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        status=r.status,
        reserved_at=r.reserved_at,
        expires_at=r.expires_at,
        checked_in_at=r.checked_in_at,
        checked_out_at=r.checked_out_at,
        seat_number=seat.seat_number if seat else None,
        seat_type=seat.seat_type if seat else None,
        location=seat.location if seat else None,
    )


@router.post("/api/reservations", response_model=ReservationDetail, status_code=201)
def create_reservation(
    body: ReservationCreate,
    request: Request,
    current_user: User = Depends(get_active_student),
    db: Session = Depends(get_db),
):
    # 요청 시점에 만료 보정
    expire_pending_reservations(db)

    # 좌석 존재 확인
    seat = db.query(Seat).filter(Seat.id == body.seat_id, Seat.is_active == True).first()
    if not seat:
        raise HTTPException(status_code=404, detail="좌석을 찾을 수 없습니다")

    # 본인 활성 예약 확인 (1인 1좌석)
    my_active = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == current_user.id,
            Reservation.status.in_(["pending", "checked_in"]),
        )
        .first()
    )
    if my_active:
        raise HTTPException(
            status_code=409,
            detail="이미 활성 예약이 있습니다. 기존 예약을 취소하거나 퇴실 후 재예약하세요",
        )

    # 좌석 활성 예약 확인
    seat_active = (
        db.query(Reservation)
        .filter(
            Reservation.seat_id == body.seat_id,
            Reservation.status.in_(["pending", "checked_in"]),
        )
        .first()
    )
    if seat_active:
        raise HTTPException(status_code=409, detail="이미 예약 중이거나 사용 중인 좌석입니다")

    now = datetime.utcnow()
    expiry = timedelta(seconds=settings.reservation_expiry_seconds)
    reservation = Reservation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        seat_id=body.seat_id,
        status="pending",
        reserved_at=now,
        expires_at=now + expiry,
    )
    db.add(reservation)

    usage = UsageLog(
        id=str(uuid.uuid4()),
        reservation_id=reservation.id,
        user_id=current_user.id,
        seat_id=body.seat_id,
        action="reserved",
        performed_at=now,
    )
    db.add(usage)

    write_audit(
        db,
        action_type="RESERVATION_CREATE",
        actor_id=current_user.id,
        target_type="reservation",
        target_id=reservation.id,
        detail={"seat_id": body.seat_id, "seat_number": seat.seat_number},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(reservation)
    return _build_detail(reservation, db)


@router.get("/api/reservations/me", response_model=List[ReservationDetail])
def my_reservations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expire_pending_reservations(db)
    rows = (
        db.query(Reservation)
        .filter(Reservation.user_id == current_user.id)
        .order_by(Reservation.reserved_at.desc())
        .limit(50)
        .all()
    )
    return [_build_detail(r, db) for r in rows]


@router.delete("/api/reservations/{rid}", status_code=204)
def cancel_reservation(
    rid: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(Reservation).filter(Reservation.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if r.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인의 예약만 취소할 수 있습니다")
    if r.status not in ("pending",):
        raise HTTPException(
            status_code=400,
            detail="pending 상태의 예약만 취소할 수 있습니다",
        )

    now = datetime.utcnow()
    r.status = "cancelled"
    usage = UsageLog(
        id=str(uuid.uuid4()),
        reservation_id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        action="cancelled",
        performed_at=now,
    )
    db.add(usage)
    write_audit(
        db,
        action_type="RESERVATION_CANCEL",
        actor_id=current_user.id,
        target_type="reservation",
        target_id=r.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()


@router.post("/api/reservations/{rid}/checkin", response_model=ReservationDetail)
def checkin(
    rid: str,
    body: CheckinRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    현장 침대/좌석에 부착된 QR을 스캔하여 체크인.
    1차 MVP: qr_token 직접 입력 방식으로 시뮬레이션.
    실제 운영: html5-qrcode 등 카메라 스캔으로 교체 (API 변경 없음).
    """
    # 만료 보정 먼저
    expire_pending_reservations(db)

    r = db.query(Reservation).filter(Reservation.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")

    # 1. 본인 예약인지
    if r.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인의 예약이 아닙니다")

    # 2. 상태 확인
    if r.status == "checked_in":
        raise HTTPException(status_code=409, detail="이미 체크인된 예약입니다")
    if r.status in ("expired", "cancelled", "completed"):
        raise HTTPException(status_code=410, detail="유효하지 않은 예약입니다")
    if r.status != "pending":
        raise HTTPException(status_code=400, detail="체크인할 수 없는 예약 상태입니다")

    # 3. 만료 시간 확인
    if datetime.utcnow() > r.expires_at:
        r.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=410,
            detail="예약이 만료되었습니다. 재예약 후 이용하세요",
        )

    # 4. QR 토큰 일치 확인 (현장 좌석 QR과 예약 좌석 QR 대조)
    seat = db.query(Seat).filter(Seat.id == r.seat_id).first()
    if not seat or seat.qr_token != body.qr_token:
        raise HTTPException(
            status_code=400,
            detail="예약하신 좌석의 QR이 아닙니다. 본인 좌석을 확인해 주세요",
        )

    now = datetime.utcnow()
    r.status = "checked_in"
    r.checked_in_at = now

    usage = UsageLog(
        id=str(uuid.uuid4()),
        reservation_id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        action="checked_in",
        performed_at=now,
    )
    db.add(usage)
    write_audit(
        db,
        action_type="CHECKIN",
        actor_id=current_user.id,
        target_type="reservation",
        target_id=r.id,
        detail={"seat_id": r.seat_id, "seat_number": seat.seat_number},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(r)
    return _build_detail(r, db)


@router.post("/api/reservations/{rid}/checkout", response_model=ReservationDetail)
def checkout(
    rid: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(Reservation).filter(Reservation.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if r.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인의 예약만 퇴실할 수 있습니다")
    if r.status != "checked_in":
        raise HTTPException(status_code=400, detail="체크인된 예약만 퇴실할 수 있습니다")

    now = datetime.utcnow()
    r.status = "completed"
    r.checked_out_at = now

    usage = UsageLog(
        id=str(uuid.uuid4()),
        reservation_id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        action="checked_out",
        performed_at=now,
    )
    db.add(usage)
    write_audit(
        db,
        action_type="CHECKOUT",
        actor_id=current_user.id,
        target_type="reservation",
        target_id=r.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(r)
    return _build_detail(r, db)


# ─── 관리자 전용 ─────────────────────────────────────────────────────────────

@router.get("/api/admin/reservations", response_model=List[ReservationDetail])
def admin_list_reservations(
    status: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    expire_pending_reservations(db)
    query = db.query(Reservation)
    if status:
        query = query.filter(Reservation.status == status)
    rows = query.order_by(Reservation.reserved_at.desc()).limit(200).all()

    result = []
    for r in rows:
        d = _build_detail(r, db)
        user = db.query(User).filter(User.id == r.user_id).first()
        if user:
            d.user_name = user.name
            d.user_student_id = user.student_id
        result.append(d)
    return result
