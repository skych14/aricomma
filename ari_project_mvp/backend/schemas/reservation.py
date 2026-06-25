from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReservationCreate(BaseModel):
    seat_id: str


class CheckinRequest(BaseModel):
    qr_token: str  # 현장 침대/좌석에 부착된 QR을 스캔하여 얻은 토큰


class ReservationResponse(BaseModel):
    id: str
    user_id: str
    seat_id: str
    status: str
    reserved_at: datetime
    expires_at: datetime
    checked_in_at: Optional[datetime] = None
    checked_out_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReservationDetail(ReservationResponse):
    seat_number: Optional[str] = None
    seat_type: Optional[str] = None
    location: Optional[str] = None
    user_name: Optional[str] = None
    user_student_id: Optional[str] = None
