import json
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models.audit_log import AuditLog
from models.reservation import Reservation
from models.seat import Seat
from models.usage_log import UsageLog
from models.user import User
from schemas.log import AuditLogPage, AuditLogResponse, UsageLogResponse
from utils.auth import get_current_admin, get_current_user
from utils.operation import KST, to_utc

router = APIRouter(tags=["logs"])

DELETED_ACTOR_NAME = "삭제된 사용자"


@router.get("/api/usage-logs/me", response_model=List[UsageLogResponse])
def my_usage_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UsageLog)
        .filter(UsageLog.user_id == current_user.id)
        .order_by(UsageLog.performed_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for log in rows:
        seat = db.query(Seat).filter(Seat.id == log.seat_id).first()
        result.append(
            UsageLogResponse(
                id=log.id,
                reservation_id=log.reservation_id,
                user_id=log.user_id,
                seat_id=log.seat_id,
                action=log.action,
                performed_at=log.performed_at,
                note=log.note,
                seat_number=seat.seat_number if seat else None,
                location=seat.location if seat else None,
                user_name=current_user.name,
            )
        )
    return result


@router.get("/api/admin/usage-logs", response_model=List[UsageLogResponse])
def admin_usage_logs(
    seat_id: str = None,
    user_id: str = None,
    action: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(UsageLog)
    if seat_id:
        query = query.filter(UsageLog.seat_id == seat_id)
    if user_id:
        query = query.filter(UsageLog.user_id == user_id)
    if action:
        query = query.filter(UsageLog.action == action)
    rows = query.order_by(UsageLog.performed_at.desc()).limit(500).all()

    result = []
    for log in rows:
        seat = db.query(Seat).filter(Seat.id == log.seat_id).first()
        user = db.query(User).filter(User.id == log.user_id).first()
        result.append(
            UsageLogResponse(
                id=log.id,
                reservation_id=log.reservation_id,
                user_id=log.user_id,
                seat_id=log.seat_id,
                action=log.action,
                performed_at=log.performed_at,
                note=log.note,
                seat_number=seat.seat_number if seat else None,
                location=seat.location if seat else None,
                user_name=user.name if user else None,
            )
        )
    return result


def _detail_seat_id(detail: Optional[str]) -> Optional[str]:
    """감사 로그 detail(JSON 문자열)에 적힌 seat_id."""
    if not detail:
        return None
    try:
        parsed = json.loads(detail)
    except ValueError:
        return None
    seat_id = parsed.get("seat_id") if isinstance(parsed, dict) else None
    return seat_id if isinstance(seat_id, str) else None


def _audit_seat_labels(db: Session, logs: List[AuditLog]) -> Dict[str, str]:
    """한 페이지의 감사 로그가 가리키는 자리 이름을 {로그 id: "방 번호"}로.

    detail의 seat_id → 대상이 예약이면 그 예약의 자리 → 대상이 자리면 그 자리 순으로 찾는다.
    행마다 따로 조회하지 않도록 예약·자리를 각각 한 번에 읽는다.
    """
    seat_of: Dict[str, str] = {}             # 로그 id → seat_id (바로 알 수 있는 것)
    reservation_of: Dict[str, str] = {}      # 로그 id → 예약 id (예약을 거쳐야 하는 것)
    for log in logs:
        seat_id = _detail_seat_id(log.detail)
        if seat_id:
            seat_of[log.id] = seat_id
        elif log.target_type == "reservation" and log.target_id:
            reservation_of[log.id] = log.target_id
        elif log.target_type == "seat" and log.target_id:
            seat_of[log.id] = log.target_id

    if reservation_of:
        rows = (
            db.query(Reservation.id, Reservation.seat_id)
            .filter(Reservation.id.in_(set(reservation_of.values())))
            .all()
        )
        seat_by_reservation = {rid: seat_id for rid, seat_id in rows}
        for log_id, rid in reservation_of.items():
            if rid in seat_by_reservation:
                seat_of[log_id] = seat_by_reservation[rid]

    if not seat_of:
        return {}
    seats = db.query(Seat).filter(Seat.id.in_(set(seat_of.values()))).all()
    label = {s.id: f"{s.location} {s.seat_number}" for s in seats}
    return {log_id: label[seat_id] for log_id, seat_id in seat_of.items() if seat_id in label}


def _like_pattern(term: str) -> str:
    """검색어를 LIKE 패턴으로. %, _, \\ 는 글자 그대로 찾도록 이스케이프한다."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/api/admin/audit-logs", response_model=AuditLogPage)
def admin_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    # 행위자 없는 시스템 로그도 나와야 하므로 outer join
    query = db.query(AuditLog, User).outerjoin(User, User.id == AuditLog.actor_id)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    # 날짜는 한국시간 기준: date_from 00:00 이상 ~ date_to 다음날 00:00 미만
    if date_from:
        start = datetime.combine(date_from, time.min, tzinfo=KST)
        query = query.filter(AuditLog.created_at >= to_utc(start))
    if date_to:
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=KST)
        query = query.filter(AuditLog.created_at < to_utc(end))
    term = (q or "").strip()
    if term:
        pattern = _like_pattern(term)
        query = query.filter(or_(*[
            column.ilike(pattern, escape="\\")
            for column in (
                User.name, User.student_id, User.email,
                AuditLog.target_id, AuditLog.ip_address, AuditLog.detail,
            )
        ]))

    total = query.count()
    rows = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    seat_labels = _audit_seat_labels(db, [log for log, _ in rows])

    items = []
    for log, user in rows:
        if user:
            actor_name = user.name
        elif log.actor_id:
            actor_name = DELETED_ACTOR_NAME  # 행위자가 이미 삭제·탈퇴함
        else:
            actor_name = None  # 시스템 로그
        items.append(
            AuditLogResponse(
                id=log.id,
                actor_id=log.actor_id,
                action_type=log.action_type,
                target_type=log.target_type,
                target_id=log.target_id,
                detail=log.detail,
                ip_address=log.ip_address,
                created_at=log.created_at,
                actor_name=actor_name,
                seat_label=seat_labels.get(log.id),
            )
        )
    return AuditLogPage(items=items, total=total, page=page, page_size=page_size)
