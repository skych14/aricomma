import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models.reservation import Reservation
from models.user import User
from schemas.user import (
    PasswordChange,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    WithdrawRequest,
)
from utils.account import purge_user
from utils.audit import write_audit
from utils.auth import (
    get_current_user,
    hash_password,
    token_for,
    verify_password,
)
from utils.login_guard import (
    BAD_CREDENTIALS,
    lock_remaining,
    locked_message,
    mask_email,
    record_failure,
    record_success,
)
from utils.password_policy import password_error
from utils.rate_limit import client_ip, too_many_requests

router = APIRouter(prefix="/api/auth", tags=["auth"])

RATE_LIMITED = "요청이 너무 많아요. 잠시 후 다시 시도해 주세요"


def _guard_rate(request: Request, db: Session) -> str:
    """로그인·가입 공용 IP 제한. 통과하면 그 IP를 돌려준다."""
    ip = client_ip(request)
    if too_many_requests(ip):
        write_audit(
            db,
            action_type="LOGIN_RATE_LIMITED",
            target_type="ip",
            target_id=ip,
            detail={"path": request.url.path},
            ip_address=ip,
            commit=True,
        )
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED)
    return ip


@router.post("/register", response_model=UserResponse, status_code=201)
def register(body: UserCreate, request: Request, db: Session = Depends(get_db)):
    ip = _guard_rate(request, db)

    # 이메일은 소문자로 저장되므로(schemas.normalize_email) 비교도 그대로 하면 된다
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다")
    if db.query(User).filter(User.student_id == body.student_id).first():
        raise HTTPException(status_code=400, detail="이미 등록된 학번입니다")

    now = datetime.utcnow()
    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name,
        student_id=body.student_id,
        role="student",
        privacy_agreed_at=now,
        failed_login_count=0,
        token_version=0,
        must_change_password=False,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    write_audit(
        db,
        action_type="USER_REGISTER",
        actor_id=user.id,
        target_type="user",
        target_id=user.id,
        detail={"email": user.email, "student_id": user.student_id},
        ip_address=ip,
        commit=True,
    )
    return user


@router.post("/login", response_model=Token)
def login(body: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = _guard_rate(request, db)
    now = datetime.utcnow()
    user = db.query(User).filter(User.email == body.email).first()

    # 없는 이메일도 같은 문구로 돌려보낸다. 잠금 카운트는 올리지 않는다
    # (없는 주소를 두드려서 남의 계정을 잠그게 할 수 없도록).
    if not user:
        write_audit(
            db,
            action_type="LOGIN_FAILED",
            target_type="email",
            target_id=mask_email(body.email),
            detail={"reason": "no_such_user", "email": mask_email(body.email)},
            ip_address=ip,
            commit=True,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=BAD_CREDENTIALS)

    # 잠금 중이면 비밀번호가 맞아도 막는다. 여기서 끝내므로 잠금이 길어지지 않는다.
    locked = lock_remaining(user, now)
    if locked:
        write_audit(
            db,
            action_type="LOGIN_LOCKED",
            actor_id=user.id,
            target_type="user",
            target_id=user.id,
            detail={"locked_until": locked.isoformat(), "email": mask_email(user.email)},
            ip_address=ip,
            commit=True,
        )
        raise HTTPException(status_code=423, detail=locked_message(locked, now))

    if not verify_password(body.password, user.hashed_password):
        just_locked = record_failure(user, now)
        db.commit()
        write_audit(
            db,
            action_type="LOGIN_LOCKED" if just_locked else "LOGIN_FAILED",
            actor_id=user.id,
            target_type="user",
            target_id=user.id,
            detail={
                "email": mask_email(user.email),
                "failed_count": user.failed_login_count,
                **({"locked_until": user.locked_until.isoformat()} if just_locked else {}),
            },
            ip_address=ip,
            commit=True,
        )
        if just_locked:
            raise HTTPException(status_code=423, detail=locked_message(user.locked_until, now))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=BAD_CREDENTIALS)

    record_success(user, now)
    db.commit()
    db.refresh(user)
    token = token_for(user)

    write_audit(
        db,
        action_type="USER_LOGIN",
        actor_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=ip,
        commit=True,
    )
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/password", response_model=Token)
def change_password(
    body: PasswordChange,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """비밀번호 변경. 성공하면 다른 기기는 로그아웃되고 지금 기기만 새 토큰으로 이어간다."""
    now = datetime.utcnow()

    locked = lock_remaining(current_user, now)
    if locked:
        raise HTTPException(status_code=423, detail=locked_message(locked, now))

    if not verify_password(body.current_password, current_user.hashed_password):
        # 로그인과 같은 카운터를 쓴다 — 여기로 우회해서 비밀번호를 떠볼 수 없게
        just_locked = record_failure(current_user, now)
        db.commit()
        write_audit(
            db,
            action_type="LOGIN_LOCKED" if just_locked else "LOGIN_FAILED",
            actor_id=current_user.id,
            target_type="user",
            target_id=current_user.id,
            detail={"reason": "password_change", "email": mask_email(current_user.email)},
            ip_address=client_ip(request),
            commit=True,
        )
        if just_locked:
            raise HTTPException(
                status_code=423, detail=locked_message(current_user.locked_until, now)
            )
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")

    error = password_error(body.new_password, current_user.student_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="지금 쓰는 비밀번호와 다른 것으로 바꿔 주세요")

    current_user.hashed_password = hash_password(body.new_password)
    current_user.token_version = (current_user.token_version or 0) + 1
    current_user.must_change_password = False
    record_success(current_user, now)
    current_user.updated_at = now
    db.commit()
    db.refresh(current_user)

    write_audit(
        db,
        action_type="PASSWORD_CHANGE",
        actor_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
        ip_address=client_ip(request),
        commit=True,
    )
    return {"access_token": token_for(current_user), "token_type": "bearer", "user": current_user}


@router.delete("/me", status_code=200)
def withdraw(
    body: WithdrawRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """본인 탈퇴. 비밀번호와 학번이 모두 맞아야 한다."""
    if current_user.role == "admin":
        raise HTTPException(status_code=400, detail="관리자 계정은 탈퇴할 수 없습니다")

    now = datetime.utcnow()
    locked = lock_remaining(current_user, now)
    if locked:
        raise HTTPException(status_code=423, detail=locked_message(locked, now))

    if not verify_password(body.password, current_user.hashed_password):
        record_failure(current_user, now)
        db.commit()
        raise HTTPException(status_code=400, detail="비밀번호가 올바르지 않습니다")
    # 저장된 학번은 대문자로 정규화돼 있으므로(schemas.normalize_student_id) 입력도 맞춘다
    if (body.student_id or "").strip().upper() != current_user.student_id:
        raise HTTPException(status_code=400, detail="학번이 올바르지 않습니다")

    active = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == current_user.id,
            Reservation.status.in_(["pending", "checked_in"]),
        )
        .first()
    )
    if active:
        raise HTTPException(
            status_code=400, detail="퇴실하거나 예약을 취소한 뒤 탈퇴할 수 있어요"
        )
    if current_user.is_suspended:
        raise HTTPException(status_code=400, detail="이용 정지 중에는 탈퇴할 수 없어요")

    user_id = current_user.id
    # 학번은 앞 4자리(입학년도)만 남긴다 — 누가 빠져나갔는지 특정하지 않으면서 추이는 볼 수 있게
    student_prefix = current_user.student_id[:4]
    counts = purge_user(db, current_user)
    db.commit()

    write_audit(
        db,
        action_type="USER_WITHDRAW",
        target_type="user",
        target_id=user_id,
        detail={"student_id_prefix": student_prefix, **counts},
        ip_address=client_ip(request),
        commit=True,
    )
    return {"deleted": True, **counts}
