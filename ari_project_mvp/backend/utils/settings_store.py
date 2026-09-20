"""app_settings 테이블 접근 — 운영 모드 읽기/쓰기.

시간 규칙 자체는 utils/operation.py(순수 함수)에 있고,
여기서는 저장소 접근만 담당한다.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.app_setting import AppSetting
from utils.operation import DEFAULT_MODE, normalize_mode

OPERATION_MODE_KEY = "operation_mode"


def get_operation_mode(db: Session) -> str:
    """현재 운영 모드. 값이 없거나 알 수 없는 값이면 기본값(standard)."""
    row = db.query(AppSetting).filter(AppSetting.key == OPERATION_MODE_KEY).first()
    return normalize_mode(row.value) if row else DEFAULT_MODE


def set_operation_mode(db: Session, mode: str, admin_id: Optional[str] = None) -> str:
    """운영 모드를 저장한다. commit은 호출하는 쪽에서 한다."""
    mode = normalize_mode(mode)
    row = db.query(AppSetting).filter(AppSetting.key == OPERATION_MODE_KEY).first()
    if row:
        row.value = mode
        row.updated_at = datetime.utcnow()
        row.updated_by = admin_id
    else:
        db.add(AppSetting(
            key=OPERATION_MODE_KEY, value=mode,
            updated_at=datetime.utcnow(), updated_by=admin_id,
        ))
    return mode
