"""IP 단위 요청 제한 — 로그인·가입 무차별 시도를 늦추기 위한 것.

머신 한 대(Fly 단일 인스턴스)를 전제로 메모리에만 기록한다. 재시작하면
기록이 사라지지만, 잠금(users.locked_until)은 DB에 남으므로 계정 단위 보호는
유지된다. 여러 머신으로 늘릴 때는 Redis 같은 공용 저장소로 옮겨야 한다.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

WINDOW_SECONDS = 60
# 학교 와이파이처럼 여러 사람이 한 IP를 나눠 쓰는 경우를 생각해 넉넉히 잡는다.
# 한 계정을 노린 시도는 이 값이 아니라 utils/login_guard의 10회 잠금이 막는다.
MAX_REQUESTS = 60

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()
# 기록이 계속 쌓이지 않도록 가끔 통째로 훑어 빈 항목을 버린다
_last_sweep = 0.0
SWEEP_INTERVAL = 300


def client_ip(request: Request) -> str:
    """진짜 클라이언트 IP. Fly 프록시 뒤라 request.client.host는 프록시 주소다."""
    fly_ip = request.headers.get("Fly-Client-IP")
    if fly_ip:
        return fly_ip.strip()
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    """창을 벗어난 기록만 남은 IP를 정리한다 (_lock을 잡은 채로 호출)."""
    global _last_sweep
    if now - _last_sweep < SWEEP_INTERVAL:
        return
    _last_sweep = now
    for ip in [ip for ip, q in _hits.items() if not q or q[-1] <= now - WINDOW_SECONDS]:
        del _hits[ip]


def too_many_requests(ip: str) -> bool:
    """이번 요청을 막아야 하면 True. 통과시키는 요청만 기록에 남긴다."""
    now = time.monotonic()
    with _lock:
        _sweep(now)
        q = _hits[ip]
        while q and q[0] <= now - WINDOW_SECONDS:
            q.popleft()
        if len(q) >= MAX_REQUESTS:
            return True
        q.append(now)
        return False



# ── 로그인 실패 총량 (비밀번호 스프레이 방어) ─────────────────────
# 계정 잠금(10회)은 "한 계정에 여러 번"만 막는다. 여러 계정에 흔한 비밀번호를
# 한 번씩만 넣어 보는 스프레이는 계정마다 1회라 잠금에 걸리지 않고, IP를 바꿔 가면
# 위의 IP 제한도 피한다. 그래서 IP·계정과 무관하게 서버 전체 실패 횟수를 센다.
SPRAY_WINDOW_SECONDS = 600
# 이용자 100명 규모에서 정상적인 오타는 10분에 몇 번 수준이다. 10분 동안 전체
# 실패가 100회라면 한 명꼴로 한 번씩 틀린 셈이라 정상 사용으로는 나오기 어렵다.
SPRAY_MAX_FAILURES = 100
# 차단이 걸리면 이 시간 동안 로그인 요청을 받지 않는다. 창 길이와 같게 두면
# 차단이 풀릴 때쯤 그 전의 실패 기록도 창 밖으로 빠져 카운터가 비워진다.
SPRAY_BLOCK_SECONDS = SPRAY_WINDOW_SECONDS

_login_failures: deque = deque()
_spray_blocked_until = 0.0


def record_login_failure() -> None:
    """로그인 실패(없는 이메일·틀린 비밀번호) 때 부른다. 성공 때는 부르지 않는다."""
    now = time.monotonic()
    with _lock:
        _login_failures.append(now)
        while _login_failures and _login_failures[0] <= now - SPRAY_WINDOW_SECONDS:
            _login_failures.popleft()


def login_spray_check() -> tuple[bool, bool]:
    """로그인 요청 앞에서 부른다. (막아야 하는가, 이번에 막기 시작했는가).

    두 번째 값은 차단 구간이 시작되는 요청에서만 True — 감사 로그를 한 번만 남기려는 것.
    """
    global _spray_blocked_until
    now = time.monotonic()
    with _lock:
        if now < _spray_blocked_until:
            return True, False
        while _login_failures and _login_failures[0] <= now - SPRAY_WINDOW_SECONDS:
            _login_failures.popleft()
        if len(_login_failures) >= SPRAY_MAX_FAILURES:
            _spray_blocked_until = now + SPRAY_BLOCK_SECONDS
            return True, True
        return False, False
