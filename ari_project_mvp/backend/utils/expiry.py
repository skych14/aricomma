"""예약 만료 처리 — APScheduler와 요청 시점 보정 모두에서 호출됨."""
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

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
