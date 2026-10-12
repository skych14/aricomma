"""신고 시간대에 그 좌석을 이용한 사람을 찾는다.

신고 검증(본인만 이용했는지)과 관리자 후보 목록이 같은 기준을 쓰도록 여기에 모았다.
시스템은 후보를 "찾아서 보여줄" 뿐이고, 대상자 확정은 관리자가 한다.
"""
from datetime import datetime, timedelta
from typing import List, NamedTuple, Optional

from sqlalchemy.orm import Session

from models.reservation import Reservation
from models.usage_log import UsageLog
from models.user import User

# 미퇴실 신고를 위해 신고 구간 직전 이용자를 몇 명까지 볼지
PREVIOUS_USER_LIMIT = 3
# 직전 이용자를 몇 시간 전까지 거슬러 올라가 볼지 (며칠 전 이용자가 후보로 뜨지 않게)
RECENT_HOURS = 6

RELATION_IN_USE = "in_use"          # 신고 시각에 그 자리에 체크인 중
RELATION_OVERLAPPED = "overlapped"  # 발생 구간과 이용 시간이 겹침
RELATION_RECENT = "recent"          # 발생 구간 직전에 이용이 끝남
_RELATION_ORDER = {RELATION_IN_USE: 0, RELATION_OVERLAPPED: 1, RELATION_RECENT: 2}


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
    db: Session, seat_id: str, start: datetime, limit: int = PREVIOUS_USER_LIMIT,
    within_hours: int = RECENT_HOURS,
) -> List[Occupant]:
    """신고 구간이 시작되기 전 within_hours 안에 그 좌석을 쓰고 나간 사람들 (최근순)."""
    rows = (
        db.query(Reservation, User)
        .join(User, Reservation.user_id == User.id)
        .filter(
            Reservation.seat_id == seat_id,
            Reservation.checked_in_at.isnot(None),
            Reservation.checked_out_at.isnot(None),
            Reservation.checked_out_at <= start,
            Reservation.checked_out_at >= start - timedelta(hours=within_hours),
        )
        .order_by(Reservation.checked_out_at.desc())
        .limit(limit)
        .all()
    )
    return [Occupant(r, u, False, _checkout_kind(db, r)) for r, u in rows]


class Candidate(NamedTuple):
    occupant: Occupant
    relation: str                         # in_use | overlapped | recent
    ended_minutes_before: Optional[int]   # recent일 때만
    is_likely: bool
    is_reporter: bool


def report_candidates(
    db: Session,
    seat_id: str,
    start: datetime,
    end: datetime,
    category: str,
    reporter_id: str,
    is_live: bool = False,
    now: Optional[datetime] = None,
) -> List[Candidate]:
    """신고 한 건의 대상자 후보. 유력 → 지금 이용 중 → 시간대 겹침 → 직전 이용(최근순).

    유력은 기록상 가장 그럴듯한 한 명에게만 붙는다 (신고자 본인은 제외):
      · 취식·소음 → 신고 시각에 이용 중이던 사람, 없으면 시간대가 겹친 사람
      · 미퇴실   → 이미 이용이 끝난 사람 중 가장 최근의 자동 퇴실, 없으면 가장 최근에 끝난 사람.
                   신고 시각에 이용 중인 사람은 예약된 정상 이용이라 유력 대상이 아니다.
    """
    now = now or datetime.utcnow()
    # "N분 전 종료"의 기준 시각 — 지금 신고는 신고한 순간, 지난 일은 발생 구간 시작
    reference = end if is_live else start

    rows = []   # (occupant, relation, ended_minutes_before)
    seen = set()
    for o in seat_occupants(db, seat_id, start, end, now):
        r = o.reservation
        in_use = r.checked_in_at <= end and (r.checked_out_at is None or r.checked_out_at > end)
        rows.append((o, RELATION_IN_USE if in_use else RELATION_OVERLAPPED, None))
        seen.add(r.id)
    for o in previous_occupants(db, seat_id, start):
        if o.reservation.id in seen:
            continue
        minutes = int((reference - o.reservation.checked_out_at).total_seconds() // 60)
        rows.append((o, RELATION_RECENT, max(minutes, 0)))
        seen.add(o.reservation.id)

    def pick(pool):
        pool = [row for row in pool if row[0].user.id != reporter_id]
        return pool[0][0].reservation.id if pool else None

    of = lambda relation: [row for row in rows if row[1] == relation]
    if category == "no_checkout":
        # 이용이 끝난 사람들 (구간 안에서 끝난 사람 포함), 최근에 끝난 순
        ended = sorted(
            (row for row in rows if row[0].reservation.checked_out_at
             and row[0].reservation.checked_out_at <= end),
            key=lambda row: row[0].reservation.checked_out_at, reverse=True,
        )
        likely = pick([row for row in ended if row[0].checkout_kind == "auto"]) or pick(ended)
    else:
        likely = pick(of(RELATION_IN_USE)) or pick(of(RELATION_OVERLAPPED))

    result = [
        Candidate(o, relation, minutes, o.reservation.id == likely, o.user.id == reporter_id)
        for o, relation, minutes in rows
    ]
    # 안정 정렬 — 같은 종류 안에서는 위에서 만든 최근순이 유지된다
    result.sort(key=lambda c: (not c.is_likely, _RELATION_ORDER[c.relation]))
    return result
