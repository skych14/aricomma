from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models  # noqa: F401  — create_all이 모든 테이블을 알도록 모델을 먼저 등록
from config import settings
from database import Base, engine
from routers import (
    admin_reports,
    auth,
    logs,
    reports,
    reservations,
    seats,
    settings as settings_router,
    users,
    verifications,
)
from scheduler import start_scheduler, stop_scheduler
from utils.db_migrate import run_migrations


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시: 업로드 디렉토리 보장 (Fly.io 볼륨 마운트 후 첫 실행 시에도 생성)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # create_all은 기존 테이블에 컬럼을 추가하지 않으므로 직접 보정한다 (멱등)
    run_migrations(engine)
    start_scheduler()
    yield
    # 종료 시
    stop_scheduler()


app = FastAPI(
    title="아리쉼표 API",
    description="안양대학교 학우실 예약/체크인 서비스",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(verifications.router)
app.include_router(seats.router)
app.include_router(reservations.router)
app.include_router(logs.router)
app.include_router(users.router)
app.include_router(settings_router.router)
app.include_router(reports.router)
app.include_router(admin_reports.router)


@app.get("/")
def root():
    return {"service": "아리쉼표", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
# auto-deploy test
