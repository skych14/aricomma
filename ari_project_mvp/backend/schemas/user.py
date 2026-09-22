import re
from datetime import datetime
from typing import Optional

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, field_validator, model_validator

from utils.password_policy import validate_password

STUDENT_ID_RE = re.compile(r"^\d{9}$")
NAME_RE = re.compile(r"^[가-힣a-zA-Z ]+$")
NAME_MIN, NAME_MAX = 2, 20


def normalize_email(v: str) -> str:
    """앞뒤 공백을 떼고 전부 소문자로. 저장·조회 모두 이 형태를 쓴다."""
    v = (v or "").strip().lower()
    try:
        # deliverability 검사(도메인 조회)는 끄고 형식만 본다 — 망 상태에 안 흔들리게
        validate_email(v, check_deliverability=False)
    except EmailNotValidError:
        raise ValueError("이메일 형식이 올바르지 않습니다")
    return v


def normalize_student_id(v: str) -> str:
    v = (v or "").strip()
    if not STUDENT_ID_RE.match(v):
        raise ValueError("학번은 숫자 9자리로 입력하세요")
    return v


def normalize_name(v: str) -> str:
    v = (v or "").strip()
    if not (NAME_MIN <= len(v) <= NAME_MAX) or not NAME_RE.match(v):
        raise ValueError(f"이름은 한글 또는 영문 {NAME_MIN}~{NAME_MAX}자로 입력하세요")
    return v


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    student_id: str
    # 개인정보 수집·이용 동의. 동의 없이는 가입할 수 없다.
    privacy_agreed: bool

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return normalize_name(v)

    @field_validator("student_id")
    @classmethod
    def check_student_id(cls, v: str) -> str:
        return normalize_student_id(v)

    @field_validator("privacy_agreed")
    @classmethod
    def must_agree(cls, v: bool) -> bool:
        if not v:
            raise ValueError("개인정보 수집·이용에 동의해야 가입할 수 있어요")
        return v

    @model_validator(mode="after")
    def check_password(self):
        # 학번을 함께 봐야 해서 필드 검사가 아니라 모델 검사로 둔다 —
        # 필드 검사는 선언 순서대로 돌아서 password 차례에 student_id를 못 본다.
        validate_password(self.password, self.student_id)
        return self


class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return normalize_email(v)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class WithdrawRequest(BaseModel):
    password: str
    student_id: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    student_id: str
    role: str
    is_verified: bool
    is_suspended: bool
    suspended_until: Optional[datetime] = None   # 정지 해제 예정 시각
    # 임시 비밀번호로 로그인한 상태 — 바꾸기 전에는 다른 기능을 쓸 수 없다
    must_change_password: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("must_change_password", mode="before")
    @classmethod
    def default_false(cls, v):
        # 컬럼 추가 이전 계정은 NULL이라 False로 읽는다
        return bool(v)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TempPasswordResponse(BaseModel):
    """임시 비밀번호는 여기서 딱 한 번만 나간다 (DB에는 해시만 남는다)."""

    user_id: str
    student_id: str
    temp_password: str


class LoginEventResponse(BaseModel):
    id: str
    action_type: str          # USER_LOGIN | LOGIN_FAILED | LOGIN_LOCKED
    ip_address: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime


class AdminUserResponse(BaseModel):
    """관리자 사용자 목록 항목. 비밀번호 해시는 절대 포함하지 않는다."""

    id: str
    email: str
    name: str
    student_id: str
    role: str
    is_verified: bool
    is_suspended: bool
    created_at: datetime
    reservation_count: int = 0
    penalty_count: int = 0                        # 누적 초기화 시점 이후의 유효 패널티 수
    suspended_until: Optional[datetime] = None    # 정지 해제 예정 시각 (없으면 기한 없음)
    locked_until: Optional[datetime] = None       # 로그인 잠금 해제 시각 (없으면 잠기지 않음)
    must_change_password: bool = False


class AdminUserUpdate(BaseModel):
    is_suspended: Optional[bool] = None
    is_verified: Optional[bool] = None
