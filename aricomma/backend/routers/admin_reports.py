"""관리자용 신고 처리 / 패널티 관리.

시스템은 후보와 권장 단계를 보여줄 뿐, 대상자와 단계는 관리자가 고른 값으로만 확정된다.
"""
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.penalty import Penalty
from models.report import Report
from models.reservation import Reservation
from models.seat import Seat
from models.usage_log import UsageLog
from models.user import User
from schemas.report import (
    CandidateResponse,
    CounterResetResponse,
    PenaltyAdmin,
    ReportAdmin,
    ReportReview,
)
from utils.audit import write_audit
from utils.auth import get_current_admin
from utils.occupancy import previous_occupants, seat_occupants
from utils.penalty import (
    CATEGORY_LABELS,
    COUNTER_RESET_KEY,
    LEVEL_LABELS,
    LEVEL_SUSPEND_WEEK,
    LEVEL_WARNING,
    LEVELS,
    REPORT_STATUS_LABELS,
    REPORT_STATUSES,
    SUSPEND_LEVELS,
    active_suspensions,
    apply_suspension,
    counter_reset_at,
    counts_toward_total,
    penalty_counts,
    recommended_level,
    week_end,
)
from utils.settings_store import get_value, set_value

router = APIRouter(tags=["admin-reports"])


def _to_admin(r: Report, db: Session) -> ReportAdmin:
    seat = db.query(Seat).filter(Seat.id == r.seat_id).first()
    reporter = db.query(User).filter(User.id == r.reporter_id).first()
    accused = (
        db.query(User).filter(User.id == r.accused_user_id).first()
        if r.accused_user_id else None
    )
    return ReportAdmin(
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
        reporter_id=r.reporter_id,
        reporter_name=reporter.name if reporter else None,
        reporter_student_id=reporter.student_id if reporter else None,
        accused_user_id=r.accused_user_id,
        accused_name=accused.name if accused else None,
        accused_student_id=accused.student_id if accused else None,
        admin_note=r.admin_note,
        reviewed_at=r.reviewed_at,
    )


def _to_penalty_admin(p: Penalty, db: Session) -> PenaltyAdmin:
    user = db.query(User).filter(User.id == p.user_id).first()
    issuer = db.query(User).filter(User.id == p.issued_by).first()
    return PenaltyAdmin(
        id=p.id,
        level=p.level,
        level_label=LEVEL_LABELS.get(p.level, p.level),
        reason=p.reason,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        acknowledged_at=p.acknowledged_at,
        created_at=p.created_at,
        counts_toward_total=counts_toward_total(p, counter_reset_at(db)),
        user_id=p.user_id,
        user_name=user.name if user else None,
        user_student_id=user.student_id if user else None,
        report_id=p.report_id,
        issued_by=p.issued_by,
        issued_by_name=issuer.name if issuer else None,
        revoked_at=p.revoked_at,
    )


# ─── 신고 목록 / 후보 ────────────────────────────────────────────────────

@router.get("/api/admin/reports", response_model=List[ReportAdmin])
def list_reports(
    status: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if status and status not in REPORT_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status는 {', '.join(REPORT_STATUSES)} 중 하나여야 합니다"
        )
    q = db.query(Report)
    if status:
        q = q.filter(Report.status == status)
    rows = q.order_by(Report.created_at.desc()).limit(200).all()
    return [_to_admin(r, db) for r in rows]


@router.get("/api/admin/reports/{rid}/candidates", response_model=List[CandidateResponse])
def report_candidates(
    rid: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """그 시간대에 그 좌석을 쓴 사람 + 직전 이용자를 합쳐서 보여준다.

    누구도 지목하지 않는다. 관리자가 고를 수 있도록 기록을 정리해 보여줄 뿐이다.
    """
    r = db.query(Report).filter(Report.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다")

    now = datetime.utcnow()
    occupants = seat_occupants(db, r.seat_id, r.occurred_from, r.occurred_to, now)
    seen = {o.reservation.id for o in occupants}
    # 미퇴실 신고 대응: 신고 구간 직전에 그 좌석을 쓰고 나간 사람들
    for prev in previous_occupants(db, r.seat_id, r.occurred_from):
        if prev.reservation.id not in seen:
            occupants.append(prev)
            seen.add(prev.reservation.id)

    reset_at = counter_reset_at(db)
    counts = penalty_counts(db, {o.user.id for o in occupants}, reset_at)

    result = []
    for o in occupants:
        count = counts.get(o.user.id, 0)
        result.append(
            CandidateResponse(
                user_id=o.user.id,
                name=o.user.name,
                student_id=o.user.student_id,
                reservation_id=o.reservation.id,
                checked_in_at=o.reservation.checked_in_at,
                checked_out_at=o.reservation.checked_out_at,
                checkout_kind=o.checkout_kind,
                overlapped=o.overlapped,
                penalty_count=count,
                recommended_level=recommended_level(count),
                is_admin=o.user.role == "admin",
            )
        )
    return result


# ─── 신고 처리 ──────────────────────────────────────────────────────────

def _clear_active_reservations(db: Session, user_id: str, now: datetime) -> dict:
    """정지되는 학생의 진행 중 예약 정리: pending → cancelled, checked_in → completed."""
    cancelled = 0
    checked_out = 0
    rows = (
        db.query(Reservation)
        .filter(Reservation.user_id == user_id, Reservation.status.in_(["pending", "checked_in"]))
        .all()
    )
    for r in rows:
        if r.status == "pending":
            r.status = "cancelled"
            action, note = "cancelled", "패널티 정지로 예약 취소"
            cancelled += 1
        else:
            r.status = "completed"
            r.checked_out_at = now
            action, note = "checked_out", "패널티 정지로 자동 퇴실"
            checked_out += 1
        db.add(UsageLog(
            id=str(uuid.uuid4()),
            reservation_id=r.id,
            user_id=r.user_id,
            seat_id=r.seat_id,
            action=action,
            performed_at=now,
            note=note,
        ))
    return {"cancelled": cancelled, "checked_out": checked_out}


@router.put("/api/admin/reports/{rid}", response_model=ReportAdmin)
def review_report(
    rid: str,
    body: ReportReview,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    r = db.query(Report).filter(Report.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다")
    if r.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 신고입니다")
    if body.action not in ("penalize", "no_target", "reject"):
        raise HTTPException(
            status_code=400, detail="action은 penalize, no_target, reject 중 하나여야 합니다"
        )

    now = datetime.utcnow()
    note = (body.admin_note or "").strip() or None
    audit_detail = {"action": body.action}

    if body.action == "reject":
        if not note:
            raise HTTPException(status_code=400, detail="반려 사유를 입력해야 합니다")
        r.status = "rejected"

    elif body.action == "no_target":
        r.status = "no_target"

    else:  # penalize
        if not body.accused_user_id:
            raise HTTPException(status_code=400, detail="대상자를 선택해야 합니다")
        if body.level not in LEVELS:
            raise HTTPException(
                status_code=400, detail=f"level은 {', '.join(LEVELS)} 중 하나여야 합니다"
            )
        target = db.query(User).filter(User.id == body.accused_user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="대상 사용자를 찾을 수 없습니다")
        if target.role == "admin":
            raise HTTPException(status_code=400, detail="관리자 계정에는 패널티를 부과할 수 없습니다")

        # 단계별 종료 시각
        if body.level == LEVEL_WARNING:
            ends_at = None
        elif body.level == LEVEL_SUSPEND_WEEK:
            # 1주 정지는 서버가 계산한다 (입력값 무시)
            ends_at = week_end(now)
        else:  # suspend_term
            if not body.ends_at:
                raise HTTPException(status_code=400, detail="한 학기 정지는 해제 예정일이 필요합니다")
            if body.ends_at <= now:
                raise HTTPException(status_code=400, detail="해제 예정일은 미래여야 합니다")
            ends_at = body.ends_at

        reason = note or f"{CATEGORY_LABELS.get(r.category, r.category)} 신고 처리"
        penalty = Penalty(
            id=str(uuid.uuid4()),
            user_id=target.id,
            report_id=r.id,
            level=body.level,
            reason=reason,
            issued_by=current_admin.id,
            starts_at=now,
            ends_at=ends_at,
            created_at=now,
        )
        db.add(penalty)

        cleared = {"cancelled": 0, "checked_out": 0}
        if body.level in SUSPEND_LEVELS:
            apply_suspension(target, ends_at, now)
            cleared = _clear_active_reservations(db, target.id, now)

        r.status = "penalized"
        r.accused_user_id = target.id
        audit_detail.update({
            "accused_user_id": target.id,
            "student_id": target.student_id,
            "level": body.level,
            "ends_at": str(ends_at) if ends_at else None,
            **cleared,
        })

    r.admin_note = note
    r.reviewed_by = current_admin.id
    r.reviewed_at = now
    db.commit()

    write_audit(
        db,
        action_type="REPORT_REVIEW",
        actor_id=current_admin.id,
        target_type="report",
        target_id=r.id,
        detail=audit_detail,
        ip_address=request.client.host if request.client else None,
    )
    if body.action == "penalize":
        write_audit(
            db,
            action_type="PENALTY_ISSUE",
            actor_id=current_admin.id,
            target_type="user",
            target_id=body.accused_user_id,
            detail=audit_detail,
            ip_address=request.client.host if request.client else None,
        )
    db.commit()
    db.refresh(r)
    return _to_admin(r, db)


# ─── 패널티 ─────────────────────────────────────────────────────────────

@router.get("/api/admin/penalties", response_model=List[PenaltyAdmin])
def list_penalties(
    user_id: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Penalty)
    if user_id:
        q = q.filter(Penalty.user_id == user_id)
    rows = q.order_by(Penalty.created_at.desc()).limit(200).all()
    return [_to_penalty_admin(p, db) for p in rows]


@router.post("/api/admin/penalties/{pid}/revoke", response_model=PenaltyAdmin)
def revoke_penalty(
    pid: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """오부과 취소. 그 패널티로 걸린 정지면 해제하되, 다른 유효한 정지가 있으면 유지한다."""
    p = db.query(Penalty).filter(Penalty.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="패널티를 찾을 수 없습니다")
    if p.revoked_at:
        raise HTTPException(status_code=400, detail="이미 취소된 패널티입니다")

    now = datetime.utcnow()
    p.revoked_at = now
    p.revoked_by = current_admin.id

    lifted = False
    user = db.query(User).filter(User.id == p.user_id).first()
    if user and p.level in SUSPEND_LEVELS:
        remaining = active_suspensions(db, user.id, now, exclude_id=p.id)
        if remaining:
            # 다른 정지가 남아 있으면 가장 늦은 해제일로 맞춘다
            user.suspended_until = max(x.ends_at for x in remaining)
        elif user.suspended_until is not None:
            # 패널티로 걸린 정지만 해제한다.
            # suspended_until이 없는 정지는 관리자가 직접 건 것이므로 건드리지 않는다.
            user.is_suspended = False
            user.suspended_until = None
            lifted = True
        user.updated_at = now

    db.commit()
    write_audit(
        db,
        action_type="PENALTY_REVOKE",
        actor_id=current_admin.id,
        target_type="user",
        target_id=p.user_id,
        detail={"penalty_id": p.id, "level": p.level, "suspension_lifted": lifted},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    db.refresh(p)
    return _to_penalty_admin(p, db)


@router.post("/api/admin/penalties/reset-counter", response_model=CounterResetResponse)
def reset_penalty_counter(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """누적 횟수 기준 시점을 지금으로 옮긴다. 패널티 기록 자체는 지우지 않는다."""
    now = datetime.utcnow()
    previous = get_value(db, COUNTER_RESET_KEY)
    set_value(db, COUNTER_RESET_KEY, now.isoformat(), current_admin.id)
    db.commit()

    write_audit(
        db,
        action_type="PENALTY_COUNTER_RESET",
        actor_id=current_admin.id,
        target_type="setting",
        target_id=COUNTER_RESET_KEY,
        detail={"from": previous, "to": now.isoformat()},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return CounterResetResponse(reset_at=now)
