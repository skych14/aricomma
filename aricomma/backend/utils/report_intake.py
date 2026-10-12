"""신고 접수 공통 규칙 — 신고 화면과 체크인 화면이 같은 검사를 거치도록 여기에 모았다.

발생 구간은 서버 시각으로 정한다 (학생 휴대폰 시계를 믿지 않는다).
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.report import Report
from models.seat import Seat
from models.user import User
from utils.occupancy import seat_occupants
from utils.penalty import CATEGORIES

WINDOW_MINUTES = 15        # 신고 시각 앞뒤로 잡는 발생 구간
LOOKBACK_HOURS = 24        # 얼마나 지난 일까지 신고할 수 있는지
DAILY_REPORT_LIMIT = 3     # 24시간 동안 올릴 수 있는 신고 건수
MEMO_MAX_LENGTH = 300

SOURCE_REPORT_PAGE = "report_page"
SOURCE_CHECKIN = "checkin"


def live_window(now: datetime) -> Tuple[datetime, datetime]:
    """"지금 일어나고 있어요" — 지금까지의 15분."""
    return now - timedelta(minutes=WINDOW_MINUTES), now


def past_window(occurred_at: Optional[datetime], now: datetime) -> Tuple[datetime, datetime]:
    """지난 일 — 고른 시각 앞뒤 15분. 끝은 지금을 넘지 않는다."""
    if occurred_at is None:
        raise HTTPException(status_code=400, detail="언제 있었던 일인지 선택해주세요")
    # 약간의 시계 오차는 허용하되 미래 시각은 막는다
    if occurred_at > now + timedelta(minutes=1):
        raise HTTPException(status_code=400, detail="아직 지나지 않은 시간은 신고할 수 없어요")
    if occurred_at < now - timedelta(hours=LOOKBACK_HOURS):
        raise HTTPException(
            status_code=400, detail=f"최근 {LOOKBACK_HOURS}시간 이내의 일만 신고할 수 있어요"
        )
    window = timedelta(minutes=WINDOW_MINUTES)
    return occurred_at - window, min(occurred_at + window, now)


def prepare_report(
    db: Session,
    reporter: User,
    seat: Seat,
    category: str,
    occurred_from: datetime,
    occurred_to: datetime,
    memo: Optional[str],
    is_live: bool,
    source: str,
    now: datetime,
) -> Report:
    """검사를 통과하면 Report를 세션에 올려 돌려준다. 커밋은 부르는 쪽이 한다.

    걸리면 아무것도 바꾸지 않고 HTTPException을 던진다.
    """
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="신고 유형이 올바르지 않습니다")

    memo = (memo or "").strip() or None
    if memo and len(memo) > MEMO_MAX_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"메모는 {MEMO_MAX_LENGTH}자 이하로 입력해주세요"
        )

    # ── 남용 방지 ──
    recent = (
        db.query(Report)
        .filter(
            Report.reporter_id == reporter.id,
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
            Report.reporter_id == reporter.id,
            Report.seat_id == seat.id,
            Report.category == category,
            Report.occurred_from < occurred_to,
            Report.occurred_to > occurred_from,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="이미 접수된 신고예요")

    # 그 시간대에 그 좌석을 쓴 사람이 본인뿐이면 신고 대상이 없다.
    # (아무도 안 썼으면 관리자가 '대상 확인 불가'로 종결할 수 있도록 접수는 받는다)
    occupants = seat_occupants(db, seat.id, occurred_from, occurred_to, now)
    user_ids = {o.user.id for o in occupants}
    if user_ids and user_ids == {reporter.id}:
        raise HTTPException(status_code=400, detail="본인 이용 시간은 신고할 수 없어요")

    report = Report(
        id=str(uuid.uuid4()),
        reporter_id=reporter.id,
        seat_id=seat.id,
        category=category,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
        memo=memo,
        status="pending",
        is_live=is_live,
        source=source,
        created_at=now,
    )
    db.add(report)
    return report
