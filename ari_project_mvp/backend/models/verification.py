import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class VerificationRequest(Base):
    __tablename__ = "verification_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    file_path = Column(String, nullable=False)  # UUID 기반 난독화 경로
    ocr_result = Column(String)  # JSON 문자열
    status = Column(String, default="pending", nullable=False)  # pending|approved|rejected
    admin_note = Column(String)
    reviewed_by = Column(String, ForeignKey("users.id"))  # 처리한 관리자 ID
    reviewed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
