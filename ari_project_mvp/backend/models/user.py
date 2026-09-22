import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

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

    # 개인정보 수집·이용에 동의한 시각(UTC). 동의 없이는 가입할 수 없다.
    privacy_agreed_at = Column(DateTime)

    # ── 로그인 잠금 ──
    # 비밀번호가 틀릴 때마다 오른다. 한도에 닿으면 locked_until을 세우고 0으로 돌린다.
    failed_login_count = Column(Integer, default=0, nullable=False)
    # 잠금 해제 시각(UTC). 이 시각 전에는 비밀번호가 맞아도 로그인을 막는다.
    locked_until = Column(DateTime)

    # 발급한 토큰의 세대. 비밀번호 변경·임시 발급·탈퇴 때 올려서 다른 기기를 로그아웃시킨다.
    token_version = Column(Integer, default=0, nullable=False)
    # 관리자가 임시 비밀번호를 준 상태. 새 비밀번호로 바꾸기 전에는 다른 API를 막는다.
    must_change_password = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
