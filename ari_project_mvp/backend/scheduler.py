from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from utils.expiry import (
    auto_checkout_overdue_reservations,
    expire_pending_reservations,
    lift_expired_suspensions,
)

_scheduler = BackgroundScheduler()


def _job():
    db = SessionLocal()
    try:
        n = expire_pending_reservations(db)
        if n:
            print(f"[scheduler] {n}개 예약 만료 처리")
        m = auto_checkout_overdue_reservations(db)
        if m:
            print(f"[scheduler] {m}개 예약 자동 퇴실 처리")
        k = lift_expired_suspensions(db)
        if k:
            print(f"[scheduler] {k}개 계정 정지 자동 해제")
    finally:
        db.close()


def start_scheduler():
    _scheduler.add_job(_job, "interval", minutes=1, id="expire_reservations")
    _scheduler.start()
    print("[scheduler] 예약 만료/자동 퇴실/정지 해제 스케줄러 시작 (1분 간격)")


def stop_scheduler():
    _scheduler.shutdown(wait=False)
