"""운영 모드 조회/전환 API."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.setting import OperationModeUpdate, OperationStatus
from utils.audit import write_audit
from utils.auth import get_current_admin, get_current_user
from utils.operation import (
    MODES,
    compute_usage_end,
    is_night_rule_active,
    is_reservation_open,
    mode_label,
    next_open_time,
    operation_window,
    to_kst,
    to_utc,
    usage_minutes,
)
from utils.settings_store import get_operation_mode, set_operation_mode

router = APIRouter(tags=["settings"])


def build_status(db: Session, now_utc: datetime = None) -> OperationStatus:
    """학생 화면이 안내 문구와 예약 가능 여부를 그릴 수 있을 만큼 담는다.

    시각은 프로젝트 전체 규칙대로 UTC naive로 내려보내고,
    화면에서 KST로 표시한다.
    """
    now_utc = now_utc or datetime.utcnow()
    now_kst = to_kst(now_utc)
    mode = get_operation_mode(db)
    opens_at, closes_at = operation_window(now_kst, mode)
    next_open = next_open_time(now_kst, mode)

    return OperationStatus(
        mode=mode,
        mode_label=mode_label(mode),
        is_open_now=is_reservation_open(now_kst, mode),
        opens_at=to_utc(opens_at) if opens_at else None,
        closes_at=to_utc(closes_at) if closes_at else None,
        next_open_at=to_utc(next_open) if next_open else None,
        now=now_utc,
        # 지금 체크인한다고 가정했을 때의 이용 시간 — 안내 문구에 그대로 쓴다
        usage_minutes_if_checkin_now=usage_minutes(now_kst, mode),
        usage_ends_at_if_checkin_now=to_utc(compute_usage_end(now_kst, mode)),
        night_rule_active=is_night_rule_active(now_kst, mode),
    )


@router.get("/api/settings/operation", response_model=OperationStatus)
def get_operation_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_status(db)


@router.put("/api/admin/settings/operation", response_model=OperationStatus)
def update_operation_mode(
    body: OperationModeUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if body.mode not in MODES:
        raise HTTPException(
            status_code=400, detail=f"mode는 {' 또는 '.join(MODES)} 여야 합니다"
        )

    previous = get_operation_mode(db)
    # 진행 중인 예약의 usage_ends_at은 체크인 시점 규칙으로 이미 확정되었다.
    # 모드를 바꿔도 여기서는 절대 건드리지 않는다.
    set_operation_mode(db, body.mode, current_admin.id)
    db.commit()

    write_audit(
        db,
        action_type="MODE_CHANGE",
        actor_id=current_admin.id,
        target_type="setting",
        target_id="operation_mode",
        detail={"from": previous, "to": body.mode},
        ip_address=request.client.host if request.client else None,
        commit=True,
    )
    return build_status(db)
