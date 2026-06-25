from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from utils.expiry import expire_pending_reservations

_scheduler = BackgroundScheduler()


def _job():
    db = SessionLocal()
    try:
        n = expire_pending_reservations(db)
        if n:
            print(f"[scheduler] {n}개 예약 만료 처리")
    finally:
        db.close()


def start_scheduler():
    _scheduler.add_job(_job, "interval", minutes=1, id="expire_reservations")
    _scheduler.start()
    print("[scheduler] 예약 만료 스케줄러 시작 (1분 간격)")


def stop_scheduler():
    _scheduler.shutdown(wait=False)
