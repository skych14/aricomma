import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String

from database import Base


class Report(Base):
    """학생이 좌석·시간대를 지정해 올리는 민원 신고.

    대상자(accused_user_id)는 시스템이 자동으로 채우지 않는다.
    관리자가 후보를 보고 직접 고른 경우에만 기록된다.
    """

    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    reporter_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    seat_id = Column(String, ForeignKey("seats.id"), nullable=False, index=True)
    category = Column(String, nullable=False)  # no_checkout | eating | noise
    occurred_from = Column(DateTime, nullable=False)  # UTC
    occurred_to = Column(DateTime, nullable=False)    # UTC
    memo = Column(String)
    # "지금 일어나고 있어요"로 들어온 신고. 컬럼 도입 전 신고는 NULL이며 false로 읽는다.
    is_live = Column(Boolean, default=False)
    # report_page | checkin — 어디서 신고했는지. 컬럼 도입 전 신고는 NULL.
    source = Column(String)
    # pending | penalized | no_target | rejected
    status = Column(String, nullable=False, default="pending", index=True)
    accused_user_id = Column(String, ForeignKey("users.id"))
    admin_note = Column(String)
    reviewed_by = Column(String, ForeignKey("users.id"))
    reviewed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
