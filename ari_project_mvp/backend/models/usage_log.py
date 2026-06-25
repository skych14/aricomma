import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    reservation_id = Column(String, ForeignKey("reservations.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    seat_id = Column(String, ForeignKey("seats.id"), nullable=False, index=True)
    # reserved | checked_in | checked_out | expired | cancelled
    action = Column(String, nullable=False)
    performed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    note = Column(String)
