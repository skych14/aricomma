"""학우실 운영 모드와 이용 시간 규칙 — 순수 함수 모음.

시간 계산은 모두 한국시간(KST, UTC+9) 기준이다.
DB에는 기존 코드와 동일하게 UTC naive datetime으로 저장하므로,
경계 계산은 KST로 하고 저장 직전에 to_utc()로 되돌린다.

이 모듈의 함수는 "지금 시각"을 인자로 받는다 (내부에서 now()를 부르지 않는다).
그래야 어떤 시각이든 테스트로 재현할 수 있다.
"""
from datetime import datetime, time, timedelta, timezone
from typing import Optional

KST = timezone(timedelta(hours=9))

# ── 운영 모드 ────────────────────────────────────────────────────────────
MODE_STANDARD = "standard"   # 평상시 7시간 개방
MODE_EXTENDED = "extended"   # 시험기간 24시간 개방
MODES = (MODE_STANDARD, MODE_EXTENDED)
DEFAULT_MODE = MODE_STANDARD

MODE_LABELS = {
    MODE_STANDARD: "평상시 7시간",
    MODE_EXTENDED: "시험기간 24시간",
}

# ── 규칙 상수 ────────────────────────────────────────────────────────────
STANDARD_OPEN_HOUR = 10      # 7시간 모드: 10:00부터 예약 가능
STANDARD_CLOSE_HOUR = 17     # 7시간 모드: 17:00에 마감 (이용 종료 상한)
DEFAULT_USAGE_HOURS = 2      # 기본 이용 시간
NIGHT_START_HOUR = 22        # 22:00부터 밤 규칙 (22:00 포함)
NIGHT_END_HOUR = 9           # 09:00부터 낮 규칙 (09:00 포함)
NIGHT_MAX_HOURS = 7          # 밤 규칙 최대 이용 시간

CLOSED_MESSAGE = "지금은 이용 시간이 아니에요. 10:00~17:00에 이용할 수 있어요"


# ── 시간대 변환 ──────────────────────────────────────────────────────────

def to_kst(utc_naive: datetime) -> datetime:
    """DB에 저장된 UTC naive datetime을 KST aware datetime으로 바꾼다."""
    if utc_naive is None:
        return None
    if utc_naive.tzinfo is None:
        utc_naive = utc_naive.replace(tzinfo=timezone.utc)
    return utc_naive.astimezone(KST)


def to_utc(kst_aware: datetime) -> datetime:
    """KST aware datetime을 DB 저장용 UTC naive datetime으로 되돌린다."""
    if kst_aware is None:
        return None
    if kst_aware.tzinfo is None:
        kst_aware = kst_aware.replace(tzinfo=KST)
    return kst_aware.astimezone(timezone.utc).replace(tzinfo=None)


def _at(moment: datetime, hour: int, day_offset: int = 0) -> datetime:
    """같은 날(또는 day_offset일 뒤)의 정각 시각을 만든다."""
    base = (moment + timedelta(days=day_offset)).date()
    return datetime.combine(base, time(hour=hour), tzinfo=moment.tzinfo or KST)


def normalize_mode(mode: Optional[str]) -> str:
    return mode if mode in MODES else DEFAULT_MODE


def mode_label(mode: str) -> str:
    return MODE_LABELS.get(normalize_mode(mode), MODE_LABELS[DEFAULT_MODE])


# ── 예약 가능 여부 ───────────────────────────────────────────────────────

def is_reservation_open(now_kst: datetime, mode: str) -> bool:
    """지금 예약할 수 있는지.

    · 7시간 모드(standard): 10:00 이상 17:00 미만에만 예약 가능 (요일 구분 없음)
    · 24시간 모드(extended): 언제든 예약 가능
    """
    if normalize_mode(mode) == MODE_EXTENDED:
        return True
    return STANDARD_OPEN_HOUR <= now_kst.hour < STANDARD_CLOSE_HOUR


def next_open_time(now_kst: datetime, mode: str) -> Optional[datetime]:
    """닫혀 있을 때 다음으로 열리는 시각(KST). 지금 열려 있거나 24시간 모드면 None."""
    if is_reservation_open(now_kst, mode):
        return None
    # 여기 도달하면 반드시 7시간 모드이고 운영시간 밖이다
    if now_kst.hour < STANDARD_OPEN_HOUR:
        return _at(now_kst, STANDARD_OPEN_HOUR)          # 오늘 10:00
    return _at(now_kst, STANDARD_OPEN_HOUR, day_offset=1)  # 내일 10:00


def operation_window(now_kst: datetime, mode: str):
    """오늘 이용 가능 시간대 (opens_at, closes_at). 24시간 모드면 (None, None)."""
    if normalize_mode(mode) == MODE_EXTENDED:
        return None, None
    return _at(now_kst, STANDARD_OPEN_HOUR), _at(now_kst, STANDARD_CLOSE_HOUR)


def is_night_rule_active(now_kst: datetime, mode: str) -> bool:
    """24시간 모드에서 지금이 밤 규칙(22:00~09:00) 구간인지."""
    if normalize_mode(mode) != MODE_EXTENDED:
        return False
    return now_kst.hour >= NIGHT_START_HOUR or now_kst.hour < NIGHT_END_HOUR


# ── 이용 종료 시각 ───────────────────────────────────────────────────────

def compute_usage_end(checkin_kst: datetime, mode: str) -> datetime:
    """체크인 시각(KST)을 기준으로 이용 종료 시각(KST)을 계산한다.

    [7시간 모드]
      종료 = min(체크인 + 2시간, 그날 17:00)
      예) 14:00 → 16:00 / 16:00 → 17:00(1시간)

    [24시간 모드]
      · 09:00~22:00 체크인 (09:00 포함, 22:00 미포함) → 체크인 + 2시간
      · 22:00~09:00 체크인 (22:00 포함, 09:00 미포함) →
          min(체크인 + 7시간, 다음 09:00), 단 최소 2시간은 보장한다.
          최소 2시간 규칙이 09:00 상한보다 우선한다.
        예) 22:00 → 05:00 / 01:00 → 08:00 / 02:00 → 09:00 /
            07:00 → 09:00 / 08:00 → 10:00(09:00까지면 1시간뿐이라 2시간 보장)
    """
    mode = normalize_mode(mode)
    minimum_end = checkin_kst + timedelta(hours=DEFAULT_USAGE_HOURS)

    if mode == MODE_STANDARD:
        # 마감(17:00)을 넘길 수 없다
        return min(minimum_end, _at(checkin_kst, STANDARD_CLOSE_HOUR))

    # ── 24시간 모드 ──
    if NIGHT_END_HOUR <= checkin_kst.hour < NIGHT_START_HOUR:
        # 낮 규칙: 그대로 2시간
        return minimum_end

    # 밤 규칙: 다음 09:00은 자정 전이면 다음 날, 자정 후면 같은 날
    next_morning = _at(
        checkin_kst, NIGHT_END_HOUR,
        day_offset=1 if checkin_kst.hour >= NIGHT_START_HOUR else 0,
    )
    end = min(checkin_kst + timedelta(hours=NIGHT_MAX_HOURS), next_morning)
    # 최소 2시간 보장 (09:00 상한보다 우선)
    return max(end, minimum_end)


def usage_minutes(checkin_kst: datetime, mode: str) -> int:
    """체크인 시각 기준으로 이용 가능한 분 수."""
    end = compute_usage_end(checkin_kst, mode)
    return int((end - checkin_kst).total_seconds() // 60)
