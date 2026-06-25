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

    admin_email: str = "admin@ari.ac.kr"
    admin_password: str = "admin1234"
    admin_name: str = "관리자"

    class Config:
        env_file = ".env"


settings = Settings()
