from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SeatCreate(BaseModel):
    seat_number: str
    seat_type: str  # bed
    room_gender: str  # male | female
    location: str
    floor: int = Field(ge=1, le=2)  # 1(아래 침대) | 2(위 침대)
    bunk_group: str  # 사다리를 공유하는 침대 한 쌍 (예: A1, B1)


class SeatUpdate(BaseModel):
    seat_number: Optional[str] = None
    seat_type: Optional[str] = None
    room_gender: Optional[str] = None
    location: Optional[str] = None
    floor: Optional[int] = Field(default=None, ge=1, le=2)
    bunk_group: Optional[str] = None
    is_active: Optional[bool] = None


class SeatResponse(BaseModel):
    id: str
    seat_number: str
    seat_type: str
    room_gender: str
    location: str
    floor: int
    bunk_group: str
    is_active: bool
    current_status: str  # available | reserved | occupied
    created_at: datetime

    model_config = {"from_attributes": True}


class SeatAdminResponse(SeatResponse):
    qr_token: str
