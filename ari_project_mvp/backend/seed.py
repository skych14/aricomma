"""
초기 데이터 생성 스크립트.
python seed.py 로 실행.
이미 존재하는 데이터는 건너뜀.
"""
import sys
import uuid
from datetime import datetime

sys.path.insert(0, ".")

from config import settings
from database import SessionLocal, engine
from models import AuditLog, Reservation, Seat, UsageLog, User, VerificationRequest
from database import Base
from utils.auth import hash_password

Base.metadata.create_all(bind=engine)

SEATS = [
    ("A01", "bed", "1층 좌측"),
    ("A02", "bed", "1층 좌측"),
    ("A03", "bed", "1층 좌측"),
    ("A04", "bed", "1층 우측"),
    ("A05", "bed", "1층 우측"),
    ("B01", "chair", "2층 좌측"),
    ("B02", "chair", "2층 좌측"),
    ("B03", "chair", "2층 우측"),
    ("B04", "chair", "2층 우측"),
    ("B05", "chair", "2층 중앙"),
]


def run():
    db = SessionLocal()
    try:
        # 관리자 계정
        if not db.query(User).filter(User.email == settings.admin_email).first():
            admin = User(
                id=str(uuid.uuid4()),
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                name=settings.admin_name,
                student_id="ADMIN0000",
                role="admin",
                is_verified=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(admin)
            print(f"  관리자 생성: {settings.admin_email}")
        else:
            print(f"  관리자 이미 존재: {settings.admin_email}")

        # 테스트 학생 계정 (인증 승인 상태)
        test_student_email = "student@ari.ac.kr"
        if not db.query(User).filter(User.email == test_student_email).first():
            student = User(
                id=str(uuid.uuid4()),
                email=test_student_email,
                hashed_password=hash_password("student1234"),
                name="테스트학생",
                student_id="20210001",
                role="student",
                is_verified=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(student)
            print(f"  테스트 학생 생성: {test_student_email} (인증 완료 상태)")
        else:
            print(f"  테스트 학생 이미 존재: {test_student_email}")

        # 테스트 학생 계정 (미인증 상태)
        unverified_email = "student2@ari.ac.kr"
        if not db.query(User).filter(User.email == unverified_email).first():
            student2 = User(
                id=str(uuid.uuid4()),
                email=unverified_email,
                hashed_password=hash_password("student1234"),
                name="미인증학생",
                student_id="20210002",
                role="student",
                is_verified=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(student2)
            print(f"  미인증 학생 생성: {unverified_email}")

        # 좌석 10개
        for seat_number, seat_type, location in SEATS:
            if not db.query(Seat).filter(Seat.seat_number == seat_number).first():
                seat = Seat(
                    id=str(uuid.uuid4()),
                    seat_number=seat_number,
                    seat_type=seat_type,
                    location=location,
                    qr_token=str(uuid.uuid4()),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                db.add(seat)
                print(f"  좌석 생성: {seat_number} ({seat_type}) @ {location}")
            else:
                print(f"  좌석 이미 존재: {seat_number}")

        db.commit()
        print("\nSeed 완료!")

        # QR 토큰 출력 (개발/시연용)
        print("\n=== 좌석별 QR 토큰 (체크인 시뮬레이션용) ===")
        seats = db.query(Seat).order_by(Seat.seat_number).all()
        for s in seats:
            print(f"  {s.seat_number:5s} | {s.seat_type:6s} | {s.location:12s} | QR: {s.qr_token}")

    finally:
        db.close()


if __name__ == "__main__":
    print("=== 아리쉼표 Seed 데이터 생성 ===")
    run()
