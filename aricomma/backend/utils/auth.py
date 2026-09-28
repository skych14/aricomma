from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from utils.operation import to_kst

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# 임시 비밀번호를 쓰는 동안에도 열어두는 길 — 내 정보 확인, 비밀번호 변경, 탈퇴
PASSWORD_CHANGE_ALLOWED_PATHS = ("/api/auth/me", "/api/auth/password")
PASSWORD_CHANGE_REQUIRED = {
    "detail": "새 비밀번호로 바꿔 주세요",
    "code": "PASSWORD_CHANGE_REQUIRED",
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(user_id: str, token_version: int = 0) -> str:
    """토큰에 세대(ver)를 함께 넣는다 — 비밀번호를 바꾸면 옛 토큰이 한 번에 무효가 된다."""
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "ver": int(token_version or 0), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def token_for(user: User) -> str:
    return create_access_token(user.id, user.token_version or 0)


def _decode_token(token: str) -> tuple[Optional[str], Optional[int]]:
    """(사용자 id, 토큰 세대). 서명·만료가 어긋나면 (None, None)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None, None
    ver = payload.get("ver")
    return payload.get("sub"), ver if isinstance(ver, int) else None


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id, ver = _decode_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 정보가 유효하지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다")

    # 비밀번호 변경·임시 발급·탈퇴로 세대가 올라갔으면 그 전에 받은 토큰은 무효다
    if ver is None or ver != (user.token_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="다시 로그인해 주세요",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 임시 비밀번호 상태에서는 비밀번호를 바꾸기 전까지 다른 길을 막는다.
    # 모든 API가 이 의존성을 거치므로 여기 한 곳에서 걸러낸다.
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWED_PATHS:
        raise HTTPException(status_code=403, detail=PASSWORD_CHANGE_REQUIRED)

    # 서버가 자는 동안 정지 기간이 끝났을 수 있으므로 여기서도 확인해 즉시 풀어준다
    now = datetime.utcnow()
    if user.is_suspended and user.suspended_until and user.suspended_until <= now:
        user.is_suspended = False
        user.suspended_until = None
        user.updated_at = now
        db.commit()
        db.refresh(user)
    return user


def get_current_student(user: User = Depends(get_current_user)) -> User:
    if user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 접근할 수 있습니다")
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다")
    return user


def get_verified_student(user: User = Depends(get_current_student)) -> User:
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="학생 인증이 완료되어야 예약할 수 있습니다",
        )
    return user


def suspension_message(user: User, action: str = "예약") -> str:
    """정지 안내 문구. 해제 예정일이 있으면 함께 알려준다 (한국시간 표기).

    action은 막힌 동작("예약" / "이용") — 예약 화면과 체크인 화면에서 읽히는
    문장이 다르기 때문에 부르는 쪽이 정한다.
    """
    base = f"계정이 정지되어 {action}할 수 없습니다"
    if not user.suspended_until:
        return base
    kst = to_kst(user.suspended_until)
    return f"{base} (해제 예정: {kst.month}월 {kst.day}일 {kst:%H:%M})"


def get_active_student(user: User = Depends(get_verified_student)) -> User:
    if user.is_suspended:
        raise HTTPException(status_code=403, detail=suspension_message(user))
    return user


def get_checkin_student(user: User = Depends(get_verified_student)) -> User:
    """체크인 전용 — 막는 조건은 get_active_student와 같고 안내 문구만 다르다."""
    if user.is_suspended:
        raise HTTPException(status_code=403, detail=suspension_message(user, "이용"))
    return user
