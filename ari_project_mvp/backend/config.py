from typing import Optional

from pydantic_settings import BaseSettings

# 공개 저장소에 그대로 있는 값들 — 이 값으로 서명한 토큰은 누구나 위조할 수 있다
DEFAULT_SECRET_KEY = "change-me-in-production"
KNOWN_PLACEHOLDER_SECRETS = {
    DEFAULT_SECRET_KEY,
    "change-me-in-production-use-long-random-string",  # .env.example의 값
}
MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    database_url: str = "sqlite:///./ari_project.db"
    secret_key: str = DEFAULT_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24시간

    upload_dir: str = "./uploads"
    cors_origins: str = "http://localhost:5173"

    # 개발 테스트용: 환경변수로 만료 시간 조절 가능 (기본 10분)
    reservation_expiry_seconds: int = 600
    # 체크인 후 최대 이용 시간 (기본 2시간)
    max_usage_seconds: int = 7200

    # 테스트 학생 계정(student@, student2@) 생성 여부. 운영 서버에서는 false 유지.
    seed_test_users: bool = False

    # /docs, /redoc, /openapi.json 공개 여부. 운영 서버에서는 false 유지하고
    # 로컬 .env에서만 ENABLE_DOCS=true로 켠다 (API 구조를 밖에 알리지 않기 위함).
    enable_docs: bool = False

    admin_email: str = "admin@ari.ac.kr"
    # 기본값 없음. ADMIN_PASSWORD(운영은 fly secrets, 로컬은 .env)가 없으면
    # seed가 관리자를 만들지 않는다 (backend/scripts/README.md 참고).
    admin_password: Optional[str] = None
    admin_name: str = "관리자"

    class Config:
        env_file = ".env"


settings = Settings()


def secret_key_problem() -> str | None:
    """SECRET_KEY가 쓸 수 없는 값이면 그 이유를, 괜찮으면 None."""
    if settings.secret_key in KNOWN_PLACEHOLDER_SECRETS:
        return "기본값(공개된 값)입니다"
    if len(settings.secret_key) < MIN_SECRET_KEY_LENGTH:
        return f"{MIN_SECRET_KEY_LENGTH}자 미만입니다"
    return None
