"""계정 삭제 시 따라 지워야 하는 것들.

관리자의 계정 삭제와 본인 탈퇴가 같은 정리를 해야 해서 한 곳에 모았다.
학번 unique 제약이 즉시 풀리도록 사용자 행 자체를 지운다(소프트 삭제가 아니다).
"""
from sqlalchemy.orm import Session

from models.penalty import Penalty
from models.report import Report
from models.reservation import Reservation
from models.usage_log import UsageLog
from models.user import User
from models.verification import VerificationRequest
from utils.upload_files import delete_upload


def purge_user(db: Session, user: User) -> dict:
    """사용자와 딸린 기록을 지우고 지운 건수를 돌려준다. commit은 부르는 쪽에서.

    남이 올린 신고에 대상자로 잡혀 있던 건은 대상만 비우고 기록은 남긴다 —
    신고 처리 이력까지 사라지면 안 되기 때문.
    """
    verifications = (
        db.query(VerificationRequest).filter(VerificationRequest.user_id == user.id).all()
    )
    for v in verifications:
        delete_upload(v.file_path)
        db.delete(v)

    penalties_deleted = (
        db.query(Penalty).filter(Penalty.user_id == user.id).delete(synchronize_session=False)
    )
    reports_deleted = (
        db.query(Report).filter(Report.reporter_id == user.id).delete(synchronize_session=False)
    )
    for r in db.query(Report).filter(Report.accused_user_id == user.id).all():
        r.accused_user_id = None

    usage_logs_deleted = (
        db.query(UsageLog).filter(UsageLog.user_id == user.id).delete(synchronize_session=False)
    )
    reservations_deleted = (
        db.query(Reservation)
        .filter(Reservation.user_id == user.id)
        .delete(synchronize_session=False)
    )
    db.delete(user)

    return {
        "reservations_deleted": reservations_deleted,
        "usage_logs_deleted": usage_logs_deleted,
        "verifications_deleted": len(verifications),
        "reports_deleted": reports_deleted,
        "penalties_deleted": penalties_deleted,
    }
