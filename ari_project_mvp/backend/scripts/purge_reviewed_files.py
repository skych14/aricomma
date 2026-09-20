"""이미 처리(승인/거절)된 인증 요청의 남은 이미지 파일을 삭제한다.

승인/거절 즉시 파일을 지우도록 바뀌기 전에 쌓인 파일을 정리하기 위한 스크립트.
대기(pending) 중인 건은 관리자가 아직 확인해야 하므로 건드리지 않는다.

    python scripts/purge_reviewed_files.py
"""
import _bootstrap  # noqa: F401

from database import SessionLocal
from models.verification import VerificationRequest
from utils.upload_files import delete_upload, upload_exists


def run() -> int:
    db = SessionLocal()
    deleted = 0
    cleared = 0
    try:
        reviewed = (
            db.query(VerificationRequest)
            .filter(VerificationRequest.status != "pending")
            .all()
        )
        for v in reviewed:
            if not v.file_path:
                continue
            if upload_exists(v.file_path) and delete_upload(v.file_path):
                deleted += 1
                print(f"  삭제: {v.file_path} (요청 {v.id}, {v.status})")
            # 파일이 이미 없어도 경로는 비워 둔다 (컬럼이 NOT NULL이라 빈 문자열)
            v.file_path = ""
            cleared += 1
        db.commit()
    finally:
        db.close()

    pending = 0
    db = SessionLocal()
    try:
        pending = (
            db.query(VerificationRequest)
            .filter(VerificationRequest.status == "pending")
            .count()
        )
    finally:
        db.close()

    print(f"\n처리 완료 건 파일 삭제: {deleted}개 (경로 비움 {cleared}건)")
    print(f"대기 중 건은 건드리지 않음: {pending}건")
    return deleted


if __name__ == "__main__":
    print("=== 처리 완료된 인증자료 파일 정리 ===")
    run()
