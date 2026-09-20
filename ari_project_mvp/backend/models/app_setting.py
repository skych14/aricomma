from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from database import Base


class AppSetting(Base):
    """운영 설정 key-value 저장소. 현재는 운영 모드(operation_mode)만 사용."""

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_by = Column(String, ForeignKey("users.id"))  # 변경한 관리자 ID
