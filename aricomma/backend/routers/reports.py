"""학생용 민원 신고 / 내 패널티 조회.

학생 응답에는 신고자·피신고자의 이름이 어떤 형태로도 들어가지 않는다.
"""
from datetime import datetime
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
from utils.penalty import (
    CATEGORY_LABELS,
    LEVEL_LABELS,
    REPORT_STATUS_LABELS,
    counter_reset_at,
    counts_toward_total,
)

from utils.report_intake import (
    SOURCE_REPORT_PAGE,
    live_window,
    past_window,
    prepare_report,
)

router = APIRouter(tags=["reports"])


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
        is_live=bool(r.is_live),
        source=r.source,
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

    seat = db.query(Seat).filter(Seat.id == body.seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="자리를 찾을 수 없습니다")

    # ── 발생 구간: 서버 시각 기준으로 서버가 정한다 ──
    if body.when == "now":
        occurred_from, occurred_to = live_window(now)
    elif body.when == "past":
        occurred_from, occurred_to = past_window(body.occurred_at, now)
    else:
        raise HTTPException(status_code=400, detail="신고 시점이 올바르지 않습니다")

    report = prepare_report(
        db, current_user, seat, body.category, occurred_from, occurred_to,
        body.memo, is_live=body.when == "now", source=SOURCE_REPORT_PAGE, now=now,
    )
    write_audit(
        db,
        action_type="REPORT_CREATE",
        actor_id=current_user.id,
        target_type="report",
        target_id=report.id,
        detail={"seat_id": body.seat_id, "category": body.category, "when": body.when},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(report)
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
