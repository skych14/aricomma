from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class UsageLogResponse(BaseModel):
    id: str
    reservation_id: str
    user_id: str
    seat_id: str
    action: str
    performed_at: datetime
    note: Optional[str] = None
    seat_number: Optional[str] = None
    location: Optional[str] = None   # 방 이름 — 번호가 방마다 겹치므로 같이 보여준다
    user_name: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: str
    actor_id: Optional[str] = None
    action_type: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    actor_name: Optional[str] = None
    # 이 기록이 가리키는 자리 "남학우실 일반방 A2-2". 자리와 무관한 기록은 None.
    seat_label: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    items: List[AuditLogResponse]
    total: int  # 필터가 적용된 전체 건수
    page: int
    page_size: int
