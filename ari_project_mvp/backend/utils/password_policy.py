"""비밀번호 규칙 한 곳.

가입·변경·관리자 임시 발급·set_admin_password.py가 모두 이 함수를 쓴다.
규칙이 화면마다 달라지지 않게 하려는 것.

bcrypt는 72바이트를 넘는 입력을 조용히 잘라내므로, 길이를 64자로 막고
ASCII 출력 가능 문자만 허용해 "입력한 뒷부분이 무시되는" 상황을 없앤다.
"""
import secrets
import string

MIN_LENGTH = 10
MAX_LENGTH = 64

# 헷갈리기 쉬운 0/O/1/l/I를 뺀 임시 비밀번호용 글자
_TEMP_LETTERS = "".join(c for c in string.ascii_letters if c not in "lIO")
_TEMP_DIGITS = "".join(c for c in string.digits if c not in "01")
TEMP_PASSWORD_LENGTH = 12


def password_error(password: str, student_id: str | None = None) -> str | None:
    """규칙에 어긋나면 그 이유를 한 문장으로, 문제없으면 None."""
    if not password:
        return "비밀번호를 입력하세요"
    if any(c.isspace() for c in password):
        return "비밀번호에 공백을 넣을 수 없어요"
    # 출력 가능한 ASCII만 (한글·이모지 등은 바이트 수가 커서 bcrypt 한도에 걸린다)
    if any(not (32 < ord(c) < 127) for c in password):
        return "비밀번호는 영문, 숫자, 기호만 쓸 수 있어요"
    if len(password) < MIN_LENGTH:
        return f"비밀번호는 {MIN_LENGTH}자 이상이어야 합니다"
    if len(password) > MAX_LENGTH:
        return f"비밀번호는 {MAX_LENGTH}자 이하로 입력하세요"
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "영문과 숫자를 모두 넣어 주세요"
    if student_id and student_id.strip() and student_id.strip() in password:
        return "비밀번호에 학번을 넣을 수 없어요"
    return None


def validate_password(password: str, student_id: str | None = None) -> str:
    """규칙에 맞으면 그대로 돌려주고, 아니면 ValueError로 이유를 알린다."""
    error = password_error(password, student_id)
    if error:
        raise ValueError(error)
    return password


def generate_temp_password() -> str:
    """관리자가 발급하는 임시 비밀번호. 규칙을 반드시 통과하는 값만 내보낸다."""
    alphabet = _TEMP_LETTERS + _TEMP_DIGITS
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(TEMP_PASSWORD_LENGTH))
        # 영문·숫자가 한 개씩은 들어가야 하므로 조건을 만족할 때까지 다시 뽑는다
        if password_error(candidate) is None:
            return candidate
