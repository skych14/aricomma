import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String

from database import Base


class Seat(Base):
    __tablename__ = "seats"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    seat_number = Column(String, unique=True, nullable=False, index=True)
    seat_type = Column(String, nullable=False)  # chair | bed
    location = Column(String, nullable=False)
    # 현장 침대/좌석에 물리적으로 부착되는 고정 QR 값
    # 실제 운영: 이 값으로 QR 이미지 생성 후 인쇄해서 좌석에 부착
    qr_token = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
