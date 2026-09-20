import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class Penalty(Base):
    """관리자가 부과한 패널티. 경고는 ends_at이 없고, 정지는 반드시 종료일이 있다."""

    __tablename__ = "penalties"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    report_id = Column(String, ForeignKey("reports.id"))
    level = Column(String, nullable=False)  # warning | suspend_week | suspend_term
    reason = Column(String, nullable=False)
    issued_by = Column(String, ForeignKey("users.id"), nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime)              # 경고는 None
    acknowledged_at = Column(DateTime)      # 학생이 확인 버튼을 누른 시각
    revoked_at = Column(DateTime)           # 오부과 취소
    revoked_by = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
