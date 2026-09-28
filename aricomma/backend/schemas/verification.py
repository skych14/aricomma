from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VerificationResponse(BaseModel):
    id: str
    user_id: str
    ocr_result: Optional[str] = None
    status: str
    admin_note: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VerificationWithUser(VerificationResponse):
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_student_id: Optional[str] = None
    # 처리 완료 시 제출 이미지를 삭제하므로, 열람 가능한 파일이 남아 있는지 표시
    has_file: bool = False


class VerificationReview(BaseModel):
    action: str  # approve | reject
    admin_note: Optional[str] = None
