from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SeatCreate(BaseModel):
    seat_number: str
    seat_type: str  # bed
    room_gender: str  # male | female
    location: str


class SeatUpdate(BaseModel):
    seat_number: Optional[str] = None
    seat_type: Optional[str] = None
    room_gender: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None


class SeatResponse(BaseModel):
    id: str
    seat_number: str
    seat_type: str
    room_gender: str
    location: str
    is_active: bool
    current_status: str  # available | reserved | occupied
    created_at: datetime

    model_config = {"from_attributes": True}


class SeatAdminResponse(SeatResponse):
    qr_token: str
