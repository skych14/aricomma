"""학생용 민원 신고 / 내 패널티 조회.

학생 응답에는 신고자·피신고자의 이름이 어떤 형태로도 들어가지 않는다.
"""
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.penalty import Penalty
from models.report import Report
from models.seat import Seat
from models.user import User
from schemas.report import PenaltyMine, ReportCreate, ReportMine
from utils.audit import write_audit
from utils.auth import get_current_student, get_verified_student
from utils.occupancy import seat_occupants
from utils.penalty import (
    CATEGORIES,
    CATEGORY_LABELS,
    LEVEL_LABELS,
    REPORT_STATUS_LABELS,
    counter_reset_at,
    counts_toward_total,
)

router = APIRouter(tags=["reports"])

MAX_WINDOW_HOURS = 12      # 한 건의 신고가 덮을 수 있는 최대 구간
LOOKBACK_HOURS = 24        # 얼마나 지난 일까지 신고할 수 있는지
DAILY_REPORT_LIMIT = 3     # 24시간 동안 올릴 수 있는 신고 건수
MEMO_MAX_LENGTH = 300


def _to_mine(r: Report, seat: Seat) -> ReportMine:
    return ReportMine(
        id=r.id,
        seat_id=r.seat_id,
        seat_number=seat.seat_number if seat else None,
        location=seat.location if seat else None,
        category=r.category,
        category_label=CATEGORY_LABELS.get(r.category, r.category),
        occurred_from=r.occurred_from,
        occurred_to=r.occurred_to,
        memo=r.memo,
        status=r.status,
        status_label=REPORT_STATUS_LABELS.get(r.status, r.status),
        created_at=r.created_at,
    )


def _to_penalty_mine(p: Penalty, reset_at: Optional[datetime] = None) -> PenaltyMine:
    return PenaltyMine(
        id=p.id,
        level=p.level,
        level_label=LEVEL_LABELS.get(p.level, p.level),
        reason=p.reason,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        acknowledged_at=p.acknowledged_at,
        created_at=p.created_at,
        counts_toward_total=counts_toward_total(p, reset_at),
    )


@router.post("/api/reports", response_model=ReportMine, status_code=201)
def create_report(
    body: ReportCreate,
    request: Request,
    current_user: User = Depends(get_verified_student),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()

    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="신고 유형이 올바르지 않습니다")

    seat = db.query(Seat).filter(Seat.id == body.seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="좌석을 찾을 수 없습니다")

    # ── 시간대 검증 ──
    if body.occurred_from >= body.occurred_to:
        raise HTTPException(status_code=400, detail="시작 시각이 종료 시각보다 빨라야 합니다")
    if body.occurred_to - body.occurred_from > timedelta(hours=MAX_WINDOW_HOURS):
        raise HTTPException(
            status_code=400, detail=f"신고 시간대는 최대 {MAX_WINDOW_HOURS}시간까지 지정할 수 있어요"
        )
    # 약간의 시계 오차는 허용하되 미래 시간대는 막는다
    if body.occurred_to > now + timedelta(minutes=1):
        raise HTTPException(status_code=400, detail="아직 지나지 않은 시간은 신고할 수 없어요")
    if body.occurred_from < now - timedelta(hours=LOOKBACK_HOURS):
        raise HTTPException(
            status_code=400, detail=f"최근 {LOOKBACK_HOURS}시간 이내의 일만 신고할 수 있어요"
        )

    memo = (body.memo or "").strip() or None
    if memo and len(memo) > MEMO_MAX_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"메모는 {MEMO_MAX_LENGTH}자 이하로 입력해주세요"
        )

    # ── 남용 방지 ──
    recent = (
        db.query(Report)
        .filter(
            Report.reporter_id == current_user.id,
            Report.created_at >= now - timedelta(hours=LOOKBACK_HOURS),
        )
        .count()
    )
    if recent >= DAILY_REPORT_LIMIT:
        raise HTTPException(
            status_code=429, detail=f"하루에 신고는 {DAILY_REPORT_LIMIT}건까지 할 수 있어요"
        )

    # 같은 좌석·같은 유형으로 시간대가 겹치는 본인 신고가 이미 있으면 중복
    duplicate = (
        db.query(Report)
        .filter(
            Report.reporter_id == current_user.id,
            Report.seat_id == body.seat_id,
            Report.category == body.category,
            Report.occurred_from < body.occurred_to,
            Report.occurred_to > body.occurred_from,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="이미 접수된 신고예요")

    # 그 시간대에 그 좌석을 쓴 사람이 본인뿐이면 신고 대상이 없다.
    # (아무도 안 썼으면 관리자가 '대상 확인 불가'로 종결할 수 있도록 접수는 받는다)
    occupants = seat_occupants(db, body.seat_id, body.occurred_from, body.occurred_to, now)
    user_ids = {o.user.id for o in occupants}
    if user_ids and user_ids == {current_user.id}:
        raise HTTPException(status_code=400, detail="본인 이용 시간은 신고할 수 없어요")

    report = Report(
        id=str(uuid.uuid4()),
        reporter_id=current_user.id,
        seat_id=body.seat_id,
        category=body.category,
        occurred_from=body.occurred_from,
        occurred_to=body.occurred_to,
        memo=memo,
        status="pending",
        created_at=now,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    write_audit(
        db,
        action_type="REPORT_CREATE",
        actor_id=current_user.id,
        target_type="report",
        target_id=report.id,
        detail={"seat_id": body.seat_id, "category": body.category},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return _to_mine(report, seat)


@router.get("/api/reports/me", response_model=List[ReportMine])
def my_reports(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Report, Seat)
        .outerjoin(Seat, Report.seat_id == Seat.id)
        .filter(Report.reporter_id == current_user.id)
        .order_by(Report.created_at.desc())
        .limit(50)
        .all()
    )
    return [_to_mine(r, s) for r, s in rows]


@router.get("/api/penalties/me", response_model=List[PenaltyMine])
def my_penalties(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Penalty)
        .filter(Penalty.user_id == current_user.id, Penalty.revoked_at.is_(None))
        .order_by(Penalty.created_at.desc())
        .limit(50)
        .all()
    )
    reset_at = counter_reset_at(db)
    return [_to_penalty_mine(p, reset_at) for p in rows]


@router.post("/api/penalties/{pid}/ack", response_model=PenaltyMine)
def acknowledge_penalty(
    pid: str,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """본인 패널티 확인 처리. 남의 패널티는 존재 여부조차 알 수 없게 404."""
    p = (
        db.query(Penalty)
        .filter(Penalty.id == pid, Penalty.user_id == current_user.id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="패널티를 찾을 수 없습니다")
    if not p.acknowledged_at:
        p.acknowledged_at = datetime.utcnow()
        db.commit()
        db.refresh(p)
    return _to_penalty_mine(p, counter_reset_at(db))
