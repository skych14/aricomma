import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.user import Token, UserCreate, UserLogin, UserResponse
from utils.audit import write_audit
from utils.auth import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(body: UserCreate, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다")
    if db.query(User).filter(User.student_id == body.student_id).first():
        raise HTTPException(status_code=400, detail="이미 등록된 학번입니다")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name,
        student_id=body.student_id,
        role="student",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
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
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return user


@router.post("/login", response_model=Token)
def login(body: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
        )

    token = create_access_token(user.id)

    write_audit(
        db,
        action_type="USER_LOGIN",
        actor_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
