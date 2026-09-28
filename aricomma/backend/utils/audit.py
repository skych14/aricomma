import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.audit_log import AuditLog


def write_audit(
    db: Session,
    action_type: str,
    actor_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
    commit: bool = False,
):
    log = AuditLog(
        actor_id=actor_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        detail=json.dumps(detail, ensure_ascii=False) if detail else None,
        ip_address=ip_address,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    if commit:
        db.commit()
