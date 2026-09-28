"""패널티 단계·누적 횟수 계산.

핵심 원칙: 시스템은 "권장 단계"를 계산해 보여줄 뿐,
실제 부과는 관리자가 고른 값으로만 이뤄진다.
"""
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.penalty import Penalty
from models.user import User
from utils.settings_store import get_value

# ── 단계 ────────────────────────────────────────────────────────────────
LEVEL_WARNING = "warning"
LEVEL_SUSPEND_WEEK = "suspend_week"
LEVEL_SUSPEND_TERM = "suspend_term"
LEVELS = (LEVEL_WARNING, LEVEL_SUSPEND_WEEK, LEVEL_SUSPEND_TERM)
SUSPEND_LEVELS = (LEVEL_SUSPEND_WEEK, LEVEL_SUSPEND_TERM)

LEVEL_LABELS = {
    LEVEL_WARNING: "경고",
    LEVEL_SUSPEND_WEEK: "1주 정지",
    LEVEL_SUSPEND_TERM: "한 학기 정지",
}

SUSPEND_WEEK_DAYS = 7

# ── 신고 유형 ───────────────────────────────────────────────────────────
CATEGORIES = ("no_checkout", "eating", "noise")
CATEGORY_LABELS = {
    "no_checkout": "미퇴실",
    "eating": "취식",
    "noise": "심한 소음",
}

# ── 신고 상태 ───────────────────────────────────────────────────────────
REPORT_STATUSES = ("pending", "penalized", "no_target", "rejected")
REPORT_STATUS_LABELS = {
    "pending": "접수됨",
    "penalized": "처리 완료",
    "no_target": "대상 확인 불가",
    "rejected": "반려",
}

# 누적 횟수 초기화 시점을 담는 app_settings 키
COUNTER_RESET_KEY = "penalty_counter_reset_at"


def counter_reset_at(db: Session) -> Optional[datetime]:
    """누적 횟수를 세기 시작하는 기준 시점. 값이 없으면 전체 기간을 센다."""
    raw = get_value(db, COUNTER_RESET_KEY)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def counts_toward_total(p: Penalty, reset_at: Optional[datetime]) -> bool:
    """이 패널티가 지금 누적(이번 학기) 횟수에 들어가는지.

    _active_query와 같은 기준을 건별로 본 것 — 초기화 시점이 없으면 전부,
    있으면 그 뒤에 부과된 것만 센다. 철회 여부는 목록을 만들 때 이미 걸러진다.
    """
    return reset_at is None or p.created_at >= reset_at


def recommended_level(count: int) -> str:
    """누적 횟수에 따른 권장 단계. 0회→경고, 1회→1주, 2회 이상→한 학기.

    어디까지나 권장값이며, 관리자가 다른 단계를 고를 수 있다.
    """
    if count <= 0:
        return LEVEL_WARNING
    if count == 1:
        return LEVEL_SUSPEND_WEEK
    return LEVEL_SUSPEND_TERM


def _active_query(db: Session, reset_at: Optional[datetime]):
    """취소되지 않았고 초기화 시점 이후에 부과된 패널티."""
    q = db.query(Penalty).filter(Penalty.revoked_at.is_(None))
    if reset_at:
        q = q.filter(Penalty.created_at >= reset_at)
    return q


def penalty_count(db: Session, user_id: str, reset_at: Optional[datetime]) -> int:
    return _active_query(db, reset_at).filter(Penalty.user_id == user_id).count()


def penalty_counts(db: Session, user_ids: Iterable[str], reset_at: Optional[datetime]) -> Dict[str, int]:
    """여러 사용자의 누적 횟수를 한 번에 (N+1 방지)."""
    ids = list(user_ids)
    if not ids:
        return {}
    q = db.query(Penalty.user_id, func.count(Penalty.id)).filter(
        Penalty.revoked_at.is_(None), Penalty.user_id.in_(ids)
    )
    if reset_at:
        q = q.filter(Penalty.created_at >= reset_at)
    return dict(q.group_by(Penalty.user_id).all())


def active_suspensions(
    db: Session, user_id: str, now: datetime, exclude_id: Optional[str] = None
) -> List[Penalty]:
    """아직 유효한(취소되지 않고 종료 시각이 미래인) 정지 패널티."""
    q = (
        db.query(Penalty)
        .filter(
            Penalty.user_id == user_id,
            Penalty.revoked_at.is_(None),
            Penalty.level.in_(SUSPEND_LEVELS),
            Penalty.ends_at.isnot(None),
            Penalty.ends_at > now,
        )
    )
    if exclude_id:
        q = q.filter(Penalty.id != exclude_id)
    return q.all()


def apply_suspension(user: User, ends_at: datetime, now: datetime) -> None:
    """정지를 건다. 이미 더 늦은 해제일이 있으면 그대로 둔다."""
    user.is_suspended = True
    if user.suspended_until is None or ends_at > user.suspended_until:
        user.suspended_until = ends_at
    user.updated_at = now


def week_end(now: datetime) -> datetime:
    return now + timedelta(days=SUSPEND_WEEK_DAYS)
