import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    seat_id = Column(String, ForeignKey("seats.id"), nullable=False, index=True)
    # pending | checked_in | completed | expired | cancelled
    status = Column(String, default="pending", nullable=False, index=True)
    reserved_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)  # reserved_at + EXPIRY_SECONDS
    checked_in_at = Column(DateTime)
    checked_out_at = Column(DateTime)
    # 이용 종료 예정 시각(UTC). 체크인 시점의 운영 모드 규칙으로 계산해 저장한다.
    # 이 컬럼이 생기기 전의 예약은 NULL이며, checked_in_at + max_usage_seconds로 처리한다.
    usage_ends_at = Column(DateTime)
