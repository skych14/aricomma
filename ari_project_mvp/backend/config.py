from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./ari_project.db"
    secret_key: str = "change-me-in-production"
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
    admin_password: str = "admin1234"
    admin_name: str = "관리자"

    class Config:
        env_file = ".env"


settings = Settings()
