import uuid
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from models.verification import VerificationRequest
from schemas.verification import (
    VerificationResponse,
    VerificationReview,
    VerificationWithUser,
)
from utils.audit import write_audit
from utils.auth import get_current_admin, get_current_student
from utils.upload_files import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    delete_upload,
    is_valid_upload,
    upload_exists,
)

router = APIRouter(tags=["verifications"])

INVALID_FILE_DETAIL = "이미지 또는 PDF 파일만 올릴 수 있습니다"


def _to_with_user(v: VerificationRequest, u: User) -> VerificationWithUser:
    return VerificationWithUser(
        id=v.id,
        user_id=v.user_id,
        ocr_result=v.ocr_result,
        status=v.status,
        admin_note=v.admin_note,
        reviewed_by=v.reviewed_by,
        reviewed_at=v.reviewed_at,
        created_at=v.created_at,
        user_name=u.name,
        user_email=u.email,
        user_student_id=u.student_id,
        has_file=v.status == "pending" and upload_exists(v.file_path),
    )


@router.post("/api/verifications", response_model=VerificationResponse, status_code=201)
async def submit_verification(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    # 이미 승인된 학생은 재제출 불필요
    if current_user.is_verified:
        raise HTTPException(status_code=400, detail="이미 인증이 완료된 계정입니다")

    # 파일 확장자 검증
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=INVALID_FILE_DETAIL)

    # 파일 크기 제한
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기는 10MB를 초과할 수 없습니다")

    # 확장자만 바꾼 파일을 막기 위해 실제 내용까지 확인
    if not is_valid_upload(content, ext):
        raise HTTPException(status_code=400, detail=INVALID_FILE_DETAIL)

    # UUID 기반 난독화 경로로 저장 (파일명 추측 불가)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{uuid.uuid4()}{ext}"
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    verification = VerificationRequest(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        file_path=str(file_path),
        ocr_result=None,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(verification)
    db.commit()
    db.refresh(verification)

    write_audit(
        db,
        action_type="VERIFICATION_SUBMIT",
        actor_id=current_user.id,
        target_type="verification",
        target_id=verification.id,
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return verification


@router.get("/api/verifications/me", response_model=List[VerificationResponse])
def my_verifications(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    return (
        db.query(VerificationRequest)
        .filter(VerificationRequest.user_id == current_user.id)
        .order_by(VerificationRequest.created_at.desc())
        .all()
    )


# ─── 관리자 전용 ─────────────────────────────────────────────────────────────

@router.get("/api/admin/verifications", response_model=List[VerificationWithUser])
def admin_list_verifications(
    status: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(VerificationRequest, User).join(
        User, VerificationRequest.user_id == User.id
    )
    if status:
        query = query.filter(VerificationRequest.status == status)
    rows = query.order_by(VerificationRequest.created_at.desc()).all()
    return [_to_with_user(v, u) for v, u in rows]


@router.get("/api/admin/verifications/{vid}", response_model=VerificationWithUser)
def admin_get_verification(
    vid: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = (
        db.query(VerificationRequest, User)
        .join(User, VerificationRequest.user_id == User.id)
        .filter(VerificationRequest.id == vid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="인증 요청을 찾을 수 없습니다")
    return _to_with_user(*row)


@router.get("/api/admin/verifications/{vid}/file")
def admin_get_verification_file(
    vid: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """인증자료 파일을 관리자에게만 스트리밍 (직접 정적 서빙 차단)."""
    v = db.query(VerificationRequest).filter(VerificationRequest.id == vid).first()
    if not v:
        raise HTTPException(status_code=404, detail="인증 요청을 찾을 수 없습니다")
    # 승인/거절 즉시 원본 이미지를 지우므로 처리 완료 건은 열람할 수 없다
    if v.status != "pending":
        raise HTTPException(status_code=404, detail="처리 완료되어 파일이 삭제되었습니다")
    if not upload_exists(v.file_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    return FileResponse(v.file_path)


@router.put("/api/admin/verifications/{vid}", response_model=VerificationWithUser)
def admin_review_verification(
    vid: str,
    body: VerificationReview,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action은 approve 또는 reject여야 합니다")

    note = (body.admin_note or "").strip()
    if body.action == "reject" and not note:
        raise HTTPException(status_code=400, detail="거절 사유를 입력해야 합니다")

    v = db.query(VerificationRequest).filter(VerificationRequest.id == vid).first()
    if not v:
        raise HTTPException(status_code=404, detail="인증 요청을 찾을 수 없습니다")
    if v.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 인증 요청입니다")

    now = datetime.utcnow()
    old_path = v.file_path
    v.status = "approved" if body.action == "approve" else "rejected"
    v.admin_note = note or None
    v.reviewed_by = current_admin.id
    v.reviewed_at = now
    # 개인정보 최소 보관: 처리 결과만 남기고 제출 이미지는 즉시 삭제한다.
    # file_path가 NOT NULL이라 빈 문자열로 비운다. 삭제 실패해도 처리는 계속한다.
    deleted = delete_upload(old_path)
    v.file_path = ""

    user = db.query(User).filter(User.id == v.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="제출한 사용자를 찾을 수 없습니다")
    if body.action == "approve":
        user.is_verified = True
        user.updated_at = now

    db.commit()

    action_type = "VERIFICATION_APPROVE" if body.action == "approve" else "VERIFICATION_REJECT"
    write_audit(
        db,
        action_type=action_type,
        actor_id=current_admin.id,
        target_type="verification",
        target_id=v.id,
        detail={"user_id": v.user_id, "admin_note": note or None, "file_deleted": deleted},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )

    db.refresh(v)
    return _to_with_user(v, user)
