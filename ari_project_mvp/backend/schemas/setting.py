from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class OperationStatus(BaseModel):
    """운영 모드 현황. 모든 시각은 프로젝트 규칙대로 UTC naive."""

    mode: str                      # standard | extended
    mode_label: str                # 평상시 7시간 | 시험기간 24시간
    is_open_now: bool
    opens_at: Optional[datetime] = None       # 7시간 모드의 오늘 10:00
    closes_at: Optional[datetime] = None      # 7시간 모드의 오늘 17:00
    next_open_at: Optional[datetime] = None   # 닫혀 있을 때 다음 개방 시각
    now: datetime
    usage_minutes_if_checkin_now: int
    usage_ends_at_if_checkin_now: Optional[datetime] = None
    night_rule_active: bool = False


class OperationModeUpdate(BaseModel):
    mode: str
