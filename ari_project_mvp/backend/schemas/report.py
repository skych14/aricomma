from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, field_validator


def _to_utc_naive(v: datetime) -> datetime:
    """tz가 붙어 오면 UTC naive로 맞춘다 (프로젝트 전체가 UTC naive 저장)."""
    if v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class ReportCreate(BaseModel):
    seat_id: str
    category: str                # no_checkout | eating | noise
    occurred_from: datetime
    occurred_to: datetime
    memo: Optional[str] = None

    @field_validator("occurred_from", "occurred_to")
    @classmethod
    def normalize_tz(cls, v: datetime) -> datetime:
        return _to_utc_naive(v)


class ReportMine(BaseModel):
    """학생에게 보이는 내 신고. 대상자 정보는 어떤 형태로도 담지 않는다."""

    id: str
    seat_id: str
    seat_number: Optional[str] = None
    location: Optional[str] = None
    category: str
    category_label: str
    occurred_from: datetime
    occurred_to: datetime
    memo: Optional[str] = None
    status: str
    status_label: str            # 접수됨 / 처리 완료 / 대상 확인 불가 / 반려
    created_at: datetime


class ReportAdmin(BaseModel):
    id: str
    seat_id: str
    seat_number: Optional[str] = None
    location: Optional[str] = None
    category: str
    category_label: str
    occurred_from: datetime
    occurred_to: datetime
    memo: Optional[str] = None
    status: str
    status_label: str
    created_at: datetime
    reporter_id: str
    reporter_name: Optional[str] = None
    reporter_student_id: Optional[str] = None
    accused_user_id: Optional[str] = None
    accused_name: Optional[str] = None
    accused_student_id: Optional[str] = None
    admin_note: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class CandidateResponse(BaseModel):
    """대상자 '후보'. 시스템이 지목한 것이 아니라 기록에서 찾아 보여주는 것뿐이다."""

    user_id: str
    name: str
    student_id: str
    reservation_id: str
    checked_in_at: Optional[datetime] = None
    checked_out_at: Optional[datetime] = None
    checkout_kind: str           # self | auto | none
    overlapped: bool             # True = 신고 시간대와 겹침, False = 직전 이용자
    penalty_count: int
    recommended_level: str
    is_admin: bool = False


class ReportReview(BaseModel):
    action: str                  # penalize | no_target | reject
    accused_user_id: Optional[str] = None
    level: Optional[str] = None
    ends_at: Optional[datetime] = None
    admin_note: Optional[str] = None

    @field_validator("ends_at")
    @classmethod
    def normalize_tz(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_utc_naive(v) if v else v


class PenaltyMine(BaseModel):
    """학생에게 보이는 내 패널티. 누가 신고했는지는 담지 않는다."""

    id: str
    level: str
    level_label: str
    reason: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime
    # 이번 학기 누적(관리자가 초기화한 시점 이후) 횟수에 들어가는 건인지.
    # 화면에서 "경고 N회"를 셀 때 이 값이 true인 것만 센다.
    counts_toward_total: bool = True


class PenaltyAdmin(PenaltyMine):
    user_id: str
    user_name: Optional[str] = None
    user_student_id: Optional[str] = None
    report_id: Optional[str] = None
    issued_by: str
    issued_by_name: Optional[str] = None
    revoked_at: Optional[datetime] = None


class CounterResetResponse(BaseModel):
    reset_at: datetime
