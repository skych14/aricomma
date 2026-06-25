import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = Column(String, ForeignKey("users.id"))  # nullable: 시스템 행위 시
    action_type = Column(String, nullable=False, index=True)
    # USER_LOGIN, USER_REGISTER, VERIFICATION_SUBMIT, VERIFICATION_APPROVE,
    # VERIFICATION_REJECT, RESERVATION_CREATE, RESERVATION_CANCEL,
    # CHECKIN, CHECKOUT, RESERVATION_EXPIRED, SEAT_CREATE, SEAT_UPDATE, SEAT_DELETE
    target_type = Column(String)  # user | reservation | seat | verification
    target_id = Column(String)
    detail = Column(String)  # JSON 문자열
    ip_address = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
