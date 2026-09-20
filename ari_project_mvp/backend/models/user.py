import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    student_id = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False, default="student")  # student | admin
    is_verified = Column(Boolean, default=False, nullable=False)
    is_suspended = Column(Boolean, default=False, nullable=False)
    # 정지 해제 예정 시각(UTC). 지나면 스케줄러/로그인 시점에 자동 해제된다.
    suspended_until = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
