from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

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
    # 운영에서는 API 문서를 열지 않는다 (ENABLE_DOCS=true인 로컬에서만)
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    # 실제로 쓰는 것만 — 와일드카드는 쓰지 않는다
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# 검증 실패를 400 한 문장으로 바꿔줄 경로 (프론트가 그대로 보여줄 수 있게)
PLAIN_ERROR_PREFIXES = ("/api/auth",)
# pydantic이 붙이는 영어 머리말 — 우리 문구만 남긴다
_VALUE_ERROR_PREFIX = "Value error, "
# 값이 아예 안 온 필드에 붙일 우리말 이름
FIELD_LABELS = {
    "email": "이메일",
    "password": "비밀번호",
    "current_password": "현재 비밀번호",
    "new_password": "새 비밀번호",
    "name": "이름",
    "student_id": "학번",
}
# "…을(를) 입력하세요"가 어색한 필드는 문장을 통째로 지정한다
MISSING_MESSAGES = {
    "privacy_agreed": "개인정보 수집·이용에 동의해야 가입할 수 있어요",
}


def _first_error_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "입력값을 확인해 주세요"
    first = errors[0]
    field = str(first.get("loc", ["", ""])[-1])
    if first.get("type") == "missing":
        if field in MISSING_MESSAGES:
            return MISSING_MESSAGES[field]
        return f"{FIELD_LABELS.get(field, field)}을(를) 입력하세요"
    msg = str(first.get("msg", ""))
    if msg.startswith(_VALUE_ERROR_PREFIX):
        return msg[len(_VALUE_ERROR_PREFIX):]
    return msg or "입력값을 확인해 주세요"


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """인증 API는 422 대신 400 + 한 문장으로 돌려준다.

    다른 API는 원래대로 422 + 상세 목록 — 관리자 화면·개발 중 디버깅에 필요하다.
    """
    if request.url.path.startswith(PLAIN_ERROR_PREFIXES):
        return JSONResponse(status_code=400, content={"detail": _first_error_message(exc)})
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """detail을 dict로 준 예외는 그 dict를 그대로 본문으로 쓴다.

    비밀번호 변경 강제(PASSWORD_CHANGE_REQUIRED)처럼 프론트가 분기해야 하는
    응답에 code를 함께 실으려는 것. 기본 형태({"detail": "..."})는 그대로다.
    """
    body = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)

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
