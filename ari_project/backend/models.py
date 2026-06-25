from sqlalchemy import Column, Integer, String, DateTime
from database import Base
import datetime

# 1. 좌석 테이블
class Seat(Base):
    __tablename__ = "seats"

    id = Column(String, primary_key=True, index=True) # 예: "A-01", "A-02"
    status = Column(String, default="AVAILABLE")      # 상태: AVAILABLE(빈자리), RESERVED(예약됨), USING(이용중)

# 2. 이용 로그 테이블 (누가 언제 예약/이용/퇴실 했는지 기록)
class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    seat_id = Column(String)
    reserved_at = Column(DateTime, default=datetime.datetime.utcnow) # 예약한 시간
    checkin_at = Column(DateTime, nullable=True)                     # QR 찍은 시간
    checkout_at = Column(DateTime, nullable=True)                    # 퇴실한 시간