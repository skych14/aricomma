"""관리자 계정의 비밀번호를 바꾼다.

비밀번호는 화면에 표시되지 않도록 getpass로 입력받는다.

    python scripts/set_admin_password.py
"""
import _bootstrap  # noqa: F401

import sys
from datetime import datetime
from getpass import getpass

from config import settings
from database import SessionLocal
from models.user import User
from utils.auth import hash_password

MIN_LENGTH = 8


def run():
    email = input(f"관리자 이메일 [{settings.admin_email}]: ").strip() or settings.admin_email

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"오류: {email} 계정을 찾을 수 없습니다")
            return 1
        if user.role != "admin":
            print(f"오류: {email} 은(는) 관리자 계정이 아닙니다")
            return 1

        pw1 = getpass("새 비밀번호: ")
        if len(pw1) < MIN_LENGTH:
            print(f"오류: 비밀번호는 {MIN_LENGTH}자 이상이어야 합니다")
            return 1
        pw2 = getpass("새 비밀번호 확인: ")
        if pw1 != pw2:
            print("오류: 두 비밀번호가 일치하지 않습니다")
            return 1

        user.hashed_password = hash_password(pw1)
        user.updated_at = datetime.utcnow()
        db.commit()
        print(f"완료: {email} 비밀번호가 변경되었습니다")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    print("=== 관리자 비밀번호 변경 ===")
    sys.exit(run())
