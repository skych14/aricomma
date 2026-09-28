import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.reservation import Reservation
from models.seat import Seat
from models.user import User
from schemas.seat import SeatAdminResponse, SeatResponse, SeatUpdate
from utils.audit import write_audit
from utils.auth import get_current_admin, get_current_user
from utils.expiry import expire_pending_reservations

router = APIRouter(tags=["seats"])


def _seat_status(seat: Seat, db: Session) -> str:
    """좌석 현재 상태: available | reserved | occupied"""
    if not seat.is_active:
        return "inactive"
    active = (
        db.query(Reservation)
        .filter(
            Reservation.seat_id == seat.id,
            Reservation.status.in_(["pending", "checked_in"]),
        )
        .first()
    )
    if not active:
        return "available"
    return "reserved" if active.status == "pending" else "occupied"


@router.get("/api/seats", response_model=List[SeatResponse])
def list_seats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 요청 시점에 만료 보정
    expire_pending_reservations(db)

    seats = db.query(Seat).filter(Seat.is_active == True).order_by(Seat.seat_number).all()
    result = []
    for s in seats:
        result.append(
            SeatResponse(
                id=s.id,
                seat_number=s.seat_number,
                seat_type=s.seat_type,
                room_gender=s.room_gender,
                location=s.location,
                floor=s.floor,
                bunk_group=s.bunk_group,
                is_active=s.is_active,
                current_status=_seat_status(s, db),
                created_at=s.created_at,
            )
        )
    return result


# ─── 관리자 전용 ─────────────────────────────────────────────────────────────

@router.get("/api/admin/seats", response_model=List[SeatAdminResponse])
def admin_list_seats(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    seats = db.query(Seat).order_by(Seat.seat_number).all()
    result = []
    for s in seats:
        result.append(
            SeatAdminResponse(
                id=s.id,
                seat_number=s.seat_number,
                seat_type=s.seat_type,
                room_gender=s.room_gender,
                location=s.location,
                floor=s.floor,
                bunk_group=s.bunk_group,
                is_active=s.is_active,
                current_status=_seat_status(s, db),
                qr_token=s.qr_token,
                created_at=s.created_at,
            )
        )
    return result


def _to_admin_response(seat: Seat, db: Session) -> SeatAdminResponse:
    return SeatAdminResponse(
        id=seat.id,
        seat_number=seat.seat_number,
        seat_type=seat.seat_type,
        room_gender=seat.room_gender,
        location=seat.location,
        floor=seat.floor,
        bunk_group=seat.bunk_group,
        is_active=seat.is_active,
        current_status=_seat_status(seat, db),
        qr_token=seat.qr_token,
        created_at=seat.created_at,
    )


# 주의: 고정 경로(rotate-qr-all)를 {seat_id} 경로보다 먼저 등록해야
# "rotate-qr-all"이 seat_id로 잡히지 않는다.
@router.post("/api/admin/seats/rotate-qr-all")
def rotate_qr_all(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """활성 좌석 전체의 QR 토큰을 새로 발급 (학기별 보안 교체용).

    qr_token 외의 컬럼은 건드리지 않는다. 기존 스티커는 즉시 무효가 되므로
    재발급 후 반드시 새 QR을 인쇄해 교체해야 한다.
    """
    seats = db.query(Seat).filter(Seat.is_active == True).all()
    for seat in seats:
        seat.qr_token = str(uuid.uuid4())
    db.commit()

    # 전체 교체는 감사 로그에 한 건으로 기록하고 detail에 좌석 수를 남긴다
    write_audit(
        db,
        action_type="QR_ROTATE",
        actor_id=current_admin.id,
        target_type="seat",
        target_id=None,
        detail={"scope": "all_active", "rotated_count": len(seats)},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return {"rotated_count": len(seats)}


@router.post("/api/admin/seats/{seat_id}/rotate-qr", response_model=SeatAdminResponse)
def rotate_qr(
    seat_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """좌석 1개의 QR 토큰을 새로 발급. qr_token 외에는 아무것도 바꾸지 않는다."""
    seat = db.query(Seat).filter(Seat.id == seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="자리를 찾을 수 없습니다")

    seat.qr_token = str(uuid.uuid4())
    db.commit()
    db.refresh(seat)

    write_audit(
        db,
        action_type="QR_ROTATE",
        actor_id=current_admin.id,
        target_type="seat",
        target_id=seat.id,
        detail={"scope": "single", "seat_number": seat.seat_number, "location": seat.location},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return _to_admin_response(seat, db)


@router.put("/api/admin/seats/{seat_id}", response_model=SeatAdminResponse)
def update_seat(
    seat_id: str,
    body: SeatUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    seat = db.query(Seat).filter(Seat.id == seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="자리를 찾을 수 없습니다")

    new_number = body.seat_number if body.seat_number is not None else seat.seat_number
    new_location = body.location if body.location is not None else seat.location
    if (new_number, new_location) != (seat.seat_number, seat.location) and (
        db.query(Seat)
        .filter(Seat.seat_number == new_number, Seat.location == new_location, Seat.id != seat.id)
        .first()
    ):
        raise HTTPException(status_code=400, detail="같은 방에 이미 존재하는 자리 번호입니다")

    if body.seat_number is not None:
        seat.seat_number = body.seat_number
    if body.seat_type is not None:
        seat.seat_type = body.seat_type
    if body.room_gender is not None:
        seat.room_gender = body.room_gender
    if body.location is not None:
        seat.location = body.location
    if body.floor is not None:
        seat.floor = body.floor
    if body.bunk_group is not None:
        seat.bunk_group = body.bunk_group
    if body.is_active is not None:
        seat.is_active = body.is_active
    seat.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(seat)

    write_audit(
        db,
        action_type="SEAT_UPDATE",
        actor_id=current_admin.id,
        target_type="seat",
        target_id=seat.id,
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return SeatAdminResponse(
        id=seat.id,
        seat_number=seat.seat_number,
        seat_type=seat.seat_type,
        room_gender=seat.room_gender,
        location=seat.location,
        floor=seat.floor,
        bunk_group=seat.bunk_group,
        is_active=seat.is_active,
        current_status=_seat_status(seat, db),
        qr_token=seat.qr_token,
        created_at=seat.created_at,
    )
