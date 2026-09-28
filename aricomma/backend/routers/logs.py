from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.audit_log import AuditLog
from models.seat import Seat
from models.usage_log import UsageLog
from models.user import User
from schemas.log import AuditLogResponse, UsageLogResponse
from utils.auth import get_current_admin, get_current_user

router = APIRouter(tags=["logs"])


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
                user_name=user.name if user else None,
            )
        )
    return result


@router.get("/api/admin/audit-logs", response_model=List[AuditLogResponse])
def admin_audit_logs(
    action_type: str = None,
    actor_id: str = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)
    rows = query.order_by(AuditLog.created_at.desc()).limit(500).all()

    result = []
    for log in rows:
        user = db.query(User).filter(User.id == log.actor_id).first() if log.actor_id else None
        result.append(
            AuditLogResponse(
                id=log.id,
                actor_id=log.actor_id,
                action_type=log.action_type,
                target_type=log.target_type,
                target_id=log.target_id,
                detail=log.detail,
                ip_address=log.ip_address,
                created_at=log.created_at,
                actor_name=user.name if user else None,
            )
        )
    return result
