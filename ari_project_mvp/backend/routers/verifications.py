import json
import os
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
from utils.auth import get_current_admin, get_current_student, get_current_user
from utils.mock_ocr import run_mock_ocr

router = APIRouter(tags=["verifications"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


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
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"허용되지 않는 파일 형식입니다. 허용: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # 파일 크기 제한
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기는 10MB를 초과할 수 없습니다")

    # UUID 기반 난독화 경로로 저장 (파일명 추측 불가)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{uuid.uuid4()}{ext}"
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Mock OCR
    ocr_result = run_mock_ocr(file.filename)

    verification = VerificationRequest(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        file_path=str(file_path),
        ocr_result=json.dumps(ocr_result, ensure_ascii=False),
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

    result = []
    for v, u in rows:
        item = VerificationWithUser(
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
        )
        result.append(item)
    return result


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
    v, u = row
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
    )


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
    if not os.path.exists(v.file_path):
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

    v = db.query(VerificationRequest).filter(VerificationRequest.id == vid).first()
    if not v:
        raise HTTPException(status_code=404, detail="인증 요청을 찾을 수 없습니다")
    if v.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 인증 요청입니다")

    now = datetime.utcnow()
    v.status = "approved" if body.action == "approve" else "rejected"
    v.admin_note = body.admin_note
    v.reviewed_by = current_admin.id
    v.reviewed_at = now

    if body.action == "approve":
        user = db.query(User).filter(User.id == v.user_id).first()
        if user:
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
        detail={"user_id": v.user_id, "admin_note": body.admin_note},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )

    row = (
        db.query(VerificationRequest, User)
        .join(User, VerificationRequest.user_id == User.id)
        .filter(VerificationRequest.id == vid)
        .first()
    )
    v2, u2 = row
    return VerificationWithUser(
        id=v2.id,
        user_id=v2.user_id,
        ocr_result=v2.ocr_result,
        status=v2.status,
        admin_note=v2.admin_note,
        reviewed_by=v2.reviewed_by,
        reviewed_at=v2.reviewed_at,
        created_at=v2.created_at,
        user_name=u2.name,
        user_email=u2.email,
        user_student_id=u2.student_id,
    )
