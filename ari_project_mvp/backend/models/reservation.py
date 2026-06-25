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
