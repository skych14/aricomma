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

MALE_ROOM = "남학우실 일반방"
FEMALE_ROOM = "여학우실 일반방"
FEMALE_CAVE_ROOM = "여학우실 굴방"

# 전부 2층 침대(사다리로 연결된 1층/2층 한 쌍). seat_type은 모두 "bed".
# 좌석의 이용가능/불가 상태는 예약 현황으로 실시간 계산하므로 여기에 넣지 않는다.
# ⚠️ 화면의 좌석 위치는 frontend/src/pages/student/SeatsPage.jsx의 ROOMS에 하드코딩되어 있으므로
#    여기서 좌석·방·침대조를 바꾸면 ROOMS 설정도 함께 수정해야 한다.
SEATS = [
    # (seat_number, location, room_gender, floor, bunk_group)
    # 남학우실 일반방 — 10석
    *[
        (f"A{g}-{floor}", MALE_ROOM, "male", floor, f"A{g}")
        for g in range(1, 6)
        for floor in (1, 2)
    ],
    # 여학우실 일반방 — 12석
    *[
        (f"A{g}-{floor}", FEMALE_ROOM, "female", floor, f"A{g}")
        for g in range(1, 7)
        for floor in (1, 2)
    ],
    # 여학우실 굴방 — 6석 (번호에 층 정보가 없음: B1~B3 위층, B4~B6 아래층)
    ("B4", FEMALE_CAVE_ROOM, "female", 1, "B1"),
    ("B1", FEMALE_CAVE_ROOM, "female", 2, "B1"),
    ("B5", FEMALE_CAVE_ROOM, "female", 1, "B2"),
    ("B2", FEMALE_CAVE_ROOM, "female", 2, "B2"),
    ("B6", FEMALE_CAVE_ROOM, "female", 1, "B3"),
    ("B3", FEMALE_CAVE_ROOM, "female", 2, "B3"),
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

        # 좌석 28개 (남 10 / 여 18)
        for seat_number, location, room_gender, floor, bunk_group in SEATS:
            # 남/여 일반방이 같은 번호를 쓰므로 (seat_number, location) 조합으로 확인
            exists = (
                db.query(Seat)
                .filter(Seat.seat_number == seat_number, Seat.location == location)
                .first()
            )
            if not exists:
                seat = Seat(
                    id=str(uuid.uuid4()),
                    seat_number=seat_number,
                    seat_type="bed",
                    room_gender=room_gender,
                    location=location,
                    floor=floor,
                    bunk_group=bunk_group,
                    qr_token=str(uuid.uuid4()),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                db.add(seat)
                print(f"  좌석 생성: {location} {seat_number} ({floor}층, 침대조 {bunk_group})")
            else:
                print(f"  좌석 이미 존재: {location} {seat_number}")

        db.commit()
        print("\nSeed 완료!")

    finally:
        db.close()


if __name__ == "__main__":
    print("=== 아리쉼표 Seed 데이터 생성 ===")
    run()
