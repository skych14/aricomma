"""운영 서버에서 시드로 만들어진 테스트 학생 계정을 삭제한다.

student@ari.ac.kr / student2@ari.ac.kr 두 계정과 그 계정의
예약·이용기록·인증요청(파일 포함)만 지우고, 다른 데이터는 건드리지 않는다.

    python scripts/remove_test_users.py
"""
import _bootstrap  # noqa: F401

from database import SessionLocal
from models.reservation import Reservation
from models.usage_log import UsageLog
from models.user import User
from models.verification import VerificationRequest
from utils.upload_files import delete_upload

TEST_EMAILS = ["student@ari.ac.kr", "student2@ari.ac.kr"]


def run():
    db = SessionLocal()
    try:
        for email in TEST_EMAILS:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                print(f"  없음 (건너뜀): {email}")
                continue

            student_id = user.student_id
            verifications = (
                db.query(VerificationRequest)
                .filter(VerificationRequest.user_id == user.id)
                .all()
            )
            files_deleted = sum(1 for v in verifications if delete_upload(v.file_path))
            for v in verifications:
                db.delete(v)

            usage = (
                db.query(UsageLog)
                .filter(UsageLog.user_id == user.id)
                .delete(synchronize_session=False)
            )
            reservations = (
                db.query(Reservation)
                .filter(Reservation.user_id == user.id)
                .delete(synchronize_session=False)
            )
            db.delete(user)
            db.commit()
            print(
                f"  삭제: {email} (학번 {student_id}) — "
                f"예약 {reservations}건, 이용기록 {usage}건, "
                f"인증요청 {len(verifications)}건(파일 {files_deleted}개)"
            )
        print("\n완료. 다른 데이터는 변경되지 않았습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    print("=== 테스트 학생 계정 삭제 ===")
    run()
