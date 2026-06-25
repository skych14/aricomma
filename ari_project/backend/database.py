from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 아리쉼표 DB 파일 이름 설정 (이 코드를 실행하면 폴더에 anyang_hue.db 파일이 생깁니다)
SQLALCHEMY_DATABASE_URL = "sqlite:///./anyang_hue.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# DB 세션을 열고 닫는 함수
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()