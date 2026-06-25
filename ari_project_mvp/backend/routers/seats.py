import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.reservation import Reservation
from models.seat import Seat
from models.user import User
from schemas.seat import SeatAdminResponse, SeatCreate, SeatResponse, SeatUpdate
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
                location=s.location,
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
                location=s.location,
                is_active=s.is_active,
                current_status=_seat_status(s, db),
                qr_token=s.qr_token,
                created_at=s.created_at,
            )
        )
    return result


@router.post("/api/admin/seats", response_model=SeatAdminResponse, status_code=201)
def create_seat(
    body: SeatCreate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if db.query(Seat).filter(Seat.seat_number == body.seat_number).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 좌석 번호입니다")

    seat = Seat(
        id=str(uuid.uuid4()),
        seat_number=body.seat_number,
        seat_type=body.seat_type,
        location=body.location,
        qr_token=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(seat)
    db.commit()
    db.refresh(seat)

    write_audit(
        db,
        action_type="SEAT_CREATE",
        actor_id=current_admin.id,
        target_type="seat",
        target_id=seat.id,
        detail={"seat_number": seat.seat_number, "seat_type": seat.seat_type},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return SeatAdminResponse(
        id=seat.id,
        seat_number=seat.seat_number,
        seat_type=seat.seat_type,
        location=seat.location,
        is_active=seat.is_active,
        current_status="available",
        qr_token=seat.qr_token,
        created_at=seat.created_at,
    )


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
        raise HTTPException(status_code=404, detail="좌석을 찾을 수 없습니다")

    if body.seat_number is not None:
        seat.seat_number = body.seat_number
    if body.seat_type is not None:
        seat.seat_type = body.seat_type
    if body.location is not None:
        seat.location = body.location
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
        location=seat.location,
        is_active=seat.is_active,
        current_status=_seat_status(seat, db),
        qr_token=seat.qr_token,
        created_at=seat.created_at,
    )


@router.delete("/api/admin/seats/{seat_id}", status_code=204)
def delete_seat(
    seat_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    seat = db.query(Seat).filter(Seat.id == seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="좌석을 찾을 수 없습니다")

    active = (
        db.query(Reservation)
        .filter(
            Reservation.seat_id == seat_id,
            Reservation.status.in_(["pending", "checked_in"]),
        )
        .first()
    )
    if active:
        raise HTTPException(status_code=400, detail="현재 이용 중인 좌석은 삭제할 수 없습니다")

    write_audit(
        db,
        action_type="SEAT_DELETE",
        actor_id=current_admin.id,
        target_type="seat",
        target_id=seat_id,
        detail={"seat_number": seat.seat_number},
        ip_address=request.client.host if request.client else None,
    )
    db.delete(seat)
    db.commit()
