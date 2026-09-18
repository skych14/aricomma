import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint

from database import Base


class Seat(Base):
    __tablename__ = "seats"
    # 남/여 일반방이 같은 번호(A1-1 등)를 쓰므로 좌석번호는 방(location) 안에서만 유일
    __table_args__ = (UniqueConstraint("location", "seat_number", name="uq_seat_location_number"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    seat_number = Column(String, nullable=False, index=True)
    seat_type = Column(String, nullable=False)  # bed
    room_gender = Column(String, nullable=False, default="male")  # male | female
    location = Column(String, nullable=False)
    floor = Column(Integer, nullable=False)  # 1(아래 침대) | 2(위 침대)
    # 사다리를 공유하는 2층 침대 한 쌍의 식별자 (예: "A1", "B1")
    # 굴방은 좌석번호(B1, B4)만으로 층·짝을 알 수 없어서 별도 필드로 관리
    bunk_group = Column(String, nullable=False)
    # 현장 침대/좌석에 물리적으로 부착되는 고정 QR 값
    # 실제 운영: 이 값으로 QR 이미지 생성 후 인쇄해서 좌석에 부착
    qr_token = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
