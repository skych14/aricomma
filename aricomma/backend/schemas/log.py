from datetime import datetime
from typing import Optional

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

    model_config = {"from_attributes": True}
