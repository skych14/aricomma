"""신고 시간대에 그 좌석을 이용한 사람을 찾는다.

신고 검증(본인만 이용했는지)과 관리자 후보 목록이 같은 기준을 쓰도록 여기에 모았다.
시스템은 후보를 "찾아서 보여줄" 뿐이고, 대상자 확정은 관리자가 한다.
"""
from datetime import datetime
from typing import List, NamedTuple, Optional

from sqlalchemy.orm import Session

from models.reservation import Reservation
from models.usage_log import UsageLog
from models.user import User

# 미퇴실 신고를 위해 신고 구간 직전 이용자를 몇 명까지 볼지
PREVIOUS_USER_LIMIT = 3


class Occupant(NamedTuple):
    reservation: Reservation
    user: User
    overlapped: bool          # 신고 구간과 실제로 겹쳤는지 (False = 직전 이용자)
    checkout_kind: str        # self | auto | none


def _effective_end(r: Reservation, now: datetime) -> datetime:
    """이용이 끝난(또는 끝날) 시각. 퇴실 기록 > 종료 예정 > 지금 순으로 본다."""
    return r.checked_out_at or r.usage_ends_at or now


def _checkout_kind(db: Session, r: Reservation) -> str:
    """퇴실 방식. 자동 퇴실은 UsageLog에 사유 메모가 남고, 본인 퇴실은 메모가 없다."""
    if not r.checked_out_at:
        return "none"
    log = (
        db.query(UsageLog)
        .filter(UsageLog.reservation_id == r.id, UsageLog.action == "checked_out")
        .order_by(UsageLog.performed_at.desc())
        .first()
    )
    return "auto" if (log and log.note) else "self"


def seat_occupants(
    db: Session, seat_id: str, start: datetime, end: datetime, now: Optional[datetime] = None
) -> List[Occupant]:
    """[start, end) 구간에 그 좌석을 실제로 이용한(체크인한) 사람들."""
    now = now or datetime.utcnow()
    rows = (
        db.query(Reservation, User)
        .join(User, Reservation.user_id == User.id)
        .filter(
            Reservation.seat_id == seat_id,
            Reservation.checked_in_at.isnot(None),
            Reservation.checked_in_at < end,
        )
        .order_by(Reservation.checked_in_at.desc())
        .all()
    )
    return [
        Occupant(r, u, True, _checkout_kind(db, r))
        for r, u in rows
        if _effective_end(r, now) > start
    ]


def previous_occupants(
    db: Session, seat_id: str, start: datetime, limit: int = PREVIOUS_USER_LIMIT
) -> List[Occupant]:
    """신고 구간이 시작되기 전에 그 좌석을 쓰고 나간 사람들 (미퇴실 신고 대응)."""
    rows = (
        db.query(Reservation, User)
        .join(User, Reservation.user_id == User.id)
        .filter(
            Reservation.seat_id == seat_id,
            Reservation.checked_in_at.isnot(None),
            Reservation.checked_out_at.isnot(None),
            Reservation.checked_out_at <= start,
        )
        .order_by(Reservation.checked_out_at.desc())
        .limit(limit)
        .all()
    )
    return [Occupant(r, u, False, _checkout_kind(db, r)) for r, u in rows]
