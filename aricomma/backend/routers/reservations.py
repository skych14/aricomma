import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
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
from utils.auth import (
    get_active_student,
    get_checkin_student,
    get_current_admin,
    get_current_user,
    get_verified_student,
)
from utils.expiry import expire_pending_reservations
from utils.operation import (
    CLOSED_MESSAGE,
    EXTENSION_WINDOW_MINUTES,
    MODE_STANDARD,
    compute_usage_end,
    extension_end,
    is_reservation_open,
    to_kst,
    normalize_mode,
    to_utc,
)
from utils.rate_limit import client_ip
from utils.settings_store import get_operation_mode

router = APIRouter(tags=["reservations"])


def _usage_end(r: Reservation) -> Optional[datetime]:
    """이용 종료 예정 시각(UTC). usage_ends_at 도입 전 예약은 예전 규칙으로 계산한다."""
    if r.usage_ends_at:
        return r.usage_ends_at
    if r.checked_in_at:
        return r.checked_in_at + timedelta(seconds=settings.max_usage_seconds)
    return None


def _hhmm(utc_naive: datetime) -> str:
    return to_kst(utc_naive).strftime("%H:%M")


def _build_detail(r: Reservation, db: Session, mode: Optional[str] = None) -> ReservationDetail:
    seat = db.query(Seat).filter(Seat.id == r.seat_id).first()

    extendable_from = extend_to = None
    end = _usage_end(r) if r.status == "checked_in" else None
    if end:
        extendable_from = end - timedelta(minutes=EXTENSION_WINDOW_MINUTES)
        new_end = extension_end(to_kst(end), mode or get_operation_mode(db))
        extend_to = to_utc(new_end) if new_end else None
    return ReservationDetail(
        id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        status=r.status,
        reserved_at=r.reserved_at,
        expires_at=r.expires_at,
        checked_in_at=r.checked_in_at,
        checked_out_at=r.checked_out_at,
        usage_ends_at=r.usage_ends_at,
        seat_number=seat.seat_number if seat else None,
        seat_type=seat.seat_type if seat else None,
        location=seat.location if seat else None,
        extension_count=r.extension_count or 0,
        extendable_from=extendable_from,
        extend_to=extend_to,
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

    # 운영시간 확인 (7시간 모드일 때만 제한, 24시간 모드는 언제든 허용)
    now = datetime.utcnow()
    mode = get_operation_mode(db)
    if not is_reservation_open(to_kst(now), mode):
        raise HTTPException(status_code=409, detail=CLOSED_MESSAGE)

    # 좌석 존재 확인
    seat = db.query(Seat).filter(Seat.id == body.seat_id, Seat.is_active == True).first()
    if not seat:
        raise HTTPException(status_code=404, detail="자리를 찾을 수 없습니다")

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
        raise HTTPException(status_code=409, detail="이미 예약 중이거나 사용 중인 자리입니다")

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
    mode = get_operation_mode(db)
    return [_build_detail(r, db, mode) for r in rows]


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
    current_user: User = Depends(get_checkin_student),
    db: Session = Depends(get_db),
):
    """
    현장 침대에 부착된 QR을 카메라로 스캔해 얻은 qr_token으로 체크인.

    정지 중이면 여기서 403으로 막는다(get_checkin_student). 이미 쓰고 있는 자리를
    비우는 일은 막을 이유가 없으므로 예약 취소·퇴실은 정지 중에도 그대로 둔다.
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
            detail="예약하신 자리의 QR이 아닙니다. 본인 자리를 확인해 주세요",
        )

    now = datetime.utcnow()
    r.status = "checked_in"
    r.checked_in_at = now
    # 이용 종료 시각은 "체크인 시각"과 그 시점의 운영 모드로 확정한다.
    # 이후 관리자가 모드를 바꿔도 이 값은 다시 계산하지 않는다.
    mode = get_operation_mode(db)
    r.usage_ends_at = to_utc(compute_usage_end(to_kst(now), mode))

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
        detail={
            "seat_id": r.seat_id,
            "seat_number": seat.seat_number,
            "mode": mode,
            "usage_ends_at": str(r.usage_ends_at),
        },
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


@router.post("/api/reservations/{rid}/extend", response_model=ReservationDetail)
def extend(
    rid: str,
    request: Request,
    current_user: User = Depends(get_verified_student),
    db: Session = Depends(get_db),
):
    """
    이용 시간을 한 번(+2시간) 늘린다. 기준은 "지금"이 아니라 현재 종료 예정 시각이다.

    종료 30분 전부터 종료 전까지만 가능하고, 횟수 제한은 없지만
    연장하는 순간의 운영 모드 상한(평상시 17:00 / 시험기간 다음 09:00)을 넘지 못한다.
    """
    if current_user.is_suspended:
        raise HTTPException(status_code=403, detail="정지 중에는 연장할 수 없어요")

    r = db.query(Reservation).filter(Reservation.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if r.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인의 예약이 아닙니다")
    if r.status != "checked_in":
        raise HTTPException(status_code=400, detail="이용 중일 때만 연장할 수 있어요")

    now = datetime.utcnow()
    old_end = _usage_end(r)
    old_count = r.extension_count or 0

    window_start = old_end - timedelta(minutes=EXTENSION_WINDOW_MINUTES)
    if now < window_start:
        raise HTTPException(
            status_code=400, detail=f"{_hhmm(window_start)}부터 연장할 수 있어요"
        )
    # 자동 퇴실은 1분 간격이라, 종료 시각이 지났는데 아직 checked_in일 수 있다
    if now >= old_end:
        raise HTTPException(status_code=400, detail="이용 시간이 끝나 연장할 수 없어요")

    mode = normalize_mode(get_operation_mode(db))
    new_end_kst = extension_end(to_kst(old_end), mode)
    if new_end_kst is None:
        raise HTTPException(
            status_code=400,
            detail="운영 마감(17:00)이라 더 연장할 수 없어요"
            if mode == MODE_STANDARD else "밤 이용은 09:00까지예요",
        )
    new_end = to_utc(new_end_kst)

    # 두 번 눌러 두 번 연장되지 않도록, 읽었던 연장 횟수 그대로일 때만 바꾼다.
    # (종료 시각으로 대조하면 SQLite가 날짜를 글자로 비교해 형식이 다른 값에서 어긋난다)
    updated = (
        db.query(Reservation)
        .filter(
            Reservation.id == rid,
            Reservation.status == "checked_in",
            func.coalesce(Reservation.extension_count, 0) == old_count,
        )
        .update(
            {
                Reservation.usage_ends_at: new_end,
                Reservation.extension_count: func.coalesce(Reservation.extension_count, 0) + 1,
            },
            synchronize_session=False,
        )
    )
    if updated == 0:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="이미 연장되었어요. 화면을 새로고침해 주세요"
        )

    db.add(UsageLog(
        id=str(uuid.uuid4()),
        reservation_id=r.id,
        user_id=r.user_id,
        seat_id=r.seat_id,
        action="extended",
        performed_at=now,
        note=f"{_hhmm(old_end)} → {_hhmm(new_end)}",
    ))
    write_audit(
        db,
        action_type="RESERVATION_EXTEND",
        actor_id=current_user.id,
        target_type="reservation",
        target_id=r.id,
        detail={
            "seat_id": r.seat_id,
            "mode": mode,
            "previous_usage_ends_at": str(old_end),
            "usage_ends_at": str(new_end),
            "extension_count": old_count + 1,
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(r)
    return _build_detail(r, db, mode)


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

    mode = get_operation_mode(db)
    result = []
    for r in rows:
        d = _build_detail(r, db, mode)
        user = db.query(User).filter(User.id == r.user_id).first()
        if user:
            d.user_name = user.name
            d.user_student_id = user.student_id
        result.append(d)
    return result
