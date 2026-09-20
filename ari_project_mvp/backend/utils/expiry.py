"""예약 만료 처리 — APScheduler와 요청 시점 보정 모두에서 호출됨."""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from config import settings
from models.reservation import Reservation
from models.usage_log import UsageLog
from utils.audit import write_audit


def expire_pending_reservations(db: Session) -> int:
    """pending 상태이고 expires_at이 지난 예약을 expired로 처리한다."""
    now = datetime.utcnow()
    expired = (
        db.query(Reservation)
        .filter(Reservation.status == "pending", Reservation.expires_at < now)
        .all()
    )

    for r in expired:
        r.status = "expired"
        usage = UsageLog(
            id=str(uuid.uuid4()),
            reservation_id=r.id,
            user_id=r.user_id,
            seat_id=r.seat_id,
            action="expired",
            performed_at=now,
            note="예약 시간 초과로 자동 만료",
        )
        db.add(usage)
        write_audit(
            db,
            action_type="RESERVATION_EXPIRED",
            target_type="reservation",
            target_id=r.id,
            detail={"user_id": r.user_id, "seat_id": r.seat_id},
        )

    if expired:
        db.commit()

    return len(expired)


def auto_checkout_overdue_reservations(db: Session) -> int:
    """이용 종료 시각이 지난 checked_in 예약을 completed로 처리한다.

    · usage_ends_at이 있으면 그 시각을 쓴다 (체크인 시점의 운영 모드로 확정된 값).
    · 없으면 (컬럼 도입 전에 체크인된 예약) 예전처럼
      checked_in_at + max_usage_seconds로 처리한다.
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=settings.max_usage_seconds)
    overdue = (
        db.query(Reservation)
        .filter(
            Reservation.status == "checked_in",
            or_(
                Reservation.usage_ends_at <= now,
                and_(Reservation.usage_ends_at.is_(None), Reservation.checked_in_at < cutoff),
            ),
        )
        .all()
    )

    for r in overdue:
        r.status = "completed"
        r.checked_out_at = now
        usage = UsageLog(
            id=str(uuid.uuid4()),
            reservation_id=r.id,
            user_id=r.user_id,
            seat_id=r.seat_id,
            action="checked_out",
            performed_at=now,
            note="이용 종료 시간이 되어 자동 퇴실",
        )
        db.add(usage)
        write_audit(
            db,
            action_type="RESERVATION_AUTO_CHECKOUT",
            target_type="reservation",
            target_id=r.id,
            detail={
                "user_id": r.user_id,
                "seat_id": r.seat_id,
                "checked_in_at": str(r.checked_in_at),
                "usage_ends_at": str(r.usage_ends_at) if r.usage_ends_at else None,
            },
        )

    if overdue:
        db.commit()

    return len(overdue)
