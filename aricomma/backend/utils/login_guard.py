"""로그인 잠금 — 비밀번호를 여러 번 틀리면 잠깐 막는다.

IP 제한(utils/rate_limit)과 짝을 이룬다. IP 제한은 기계적인 난사를 늦추고,
이쪽은 한 계정을 노린 시도를 막는다. 계정 단위라 서버를 재시작해도 남는다.
"""
import math
from datetime import datetime, timedelta

from models.user import User

FAILED_LIMIT = 10
LOCK_MINUTES = 5

# 계정이 있든 없든 똑같이 보내는 문구 — 어떤 이메일이 가입돼 있는지 알려주지 않는다
BAD_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다"


def locked_message(locked_until: datetime, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    minutes = max(1, math.ceil((locked_until - now).total_seconds() / 60))
    return f"로그인 시도가 너무 많아요. {minutes}분 뒤 다시 시도해 주세요"


def lock_remaining(user: User, now: datetime | None = None) -> datetime | None:
    """아직 잠겨 있으면 해제 시각을, 아니면 None."""
    now = now or datetime.utcnow()
    if user.locked_until and user.locked_until > now:
        return user.locked_until
    return None


def record_failure(user: User, now: datetime | None = None) -> bool:
    """비밀번호가 틀렸을 때 부른다. 이번에 잠겼으면 True.

    잠금 중에는 부르지 않는다 — 부르는 쪽에서 먼저 lock_remaining으로 막으므로
    잠긴 계정을 계속 두드려도 잠금이 길어지지 않는다.
    """
    now = now or datetime.utcnow()
    user.failed_login_count = (user.failed_login_count or 0) + 1
    user.updated_at = now
    if user.failed_login_count >= FAILED_LIMIT:
        user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        user.failed_login_count = 0
        return True
    return False


def record_success(user: User, now: datetime | None = None) -> None:
    now = now or datetime.utcnow()
    if user.failed_login_count or user.locked_until:
        user.failed_login_count = 0
        user.locked_until = None
        user.updated_at = now


def mask_email(email: str) -> str:
    """감사 로그에 남길 이메일 — 앞 3글자만 남긴다."""
    email = email or ""
    return f"{email[:3]}***" if email else "***"
