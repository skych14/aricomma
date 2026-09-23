// Backend serializes UTC datetimes without 'Z', so browsers parse them as local time.
// Append 'Z' when no timezone info is present to force correct UTC interpretation.
export function parseUTC(iso) {
  if (!iso) return new Date(NaN)
  return /[Z+]/.test(iso) ? new Date(iso) : new Date(iso + 'Z')
}

export function fmtDatetime(iso) {
  if (!iso) return '—'
  return parseUTC(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

export function fmtDate(iso) {
  if (!iso) return '—'
  return parseUTC(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}

/** UTC naive ISO 문자열을 한국시간 "HH:MM"으로. 백엔드는 모든 시각을 UTC로 내려준다. */
export function fmtTime(iso) {
  if (!iso) return '—'
  return parseUTC(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Seoul',
  })
}

/** UTC naive ISO 문자열이 가리키는 한국시간의 "시"(0~23). */
export function kstHour(iso) {
  if (!iso) return null
  return Number(parseUTC(iso).toLocaleString('en-US', {
    hour: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
  }))
}

/** 분 단위를 "2시간" / "1시간 30분" / "45분"으로. */
export function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

export const REPORT_CATEGORIES = [
  { key: 'no_checkout', label: '미퇴실', desc: '이용 시간이 끝났는데 자리를 비우지 않았어요' },
  { key: 'eating', label: '취식', desc: '학우실 안에서 음식을 먹었어요' },
  { key: 'noise', label: '심한 소음', desc: '통화·대화·알람 등으로 쉬기 어려웠어요' },
]

export const PENALTY_LEVELS = [
  { key: 'warning', label: '경고' },
  { key: 'suspend_week', label: '1주 정지' },
  { key: 'suspend_term', label: '한 학기 정지' },
]

export function penaltyLevelLabel(level) {
  return PENALTY_LEVELS.find(l => l.key === level)?.label || level
}

const STATUS_KO = {
  pending: '예약 대기',
  checked_in: '이용 중',
  completed: '이용 완료',
  expired: '만료',
  cancelled: '취소',
  approved: '승인',
  rejected: '거절',
  available: '이용 가능',
  reserved: '예약 중',
  occupied: '이용 중',
  inactive: '사용 중지',
}

// 방 이름과 표시 순서 — 관리자 자리 관리 표와 QR 인쇄 화면이 같이 쓴다
export const MALE_ROOM = '남학우실 일반방'
export const FEMALE_ROOM = '여학우실 일반방'
export const FEMALE_CAVE_ROOM = '여학우실 굴방'
export const ROOM_ORDER = [MALE_ROOM, FEMALE_ROOM, FEMALE_CAVE_ROOM]

// 방 순서(ROOM_ORDER, 그 외 방은 뒤에 이름순) → 방 안에서는 seat_number 순
export function compareSeatsByRoom(a, b) {
  const rank = loc => { const i = ROOM_ORDER.indexOf(loc); return i === -1 ? ROOM_ORDER.length : i }
  return rank(a.location) - rank(b.location)
    || a.location.localeCompare(b.location, 'ko')
    || a.seat_number.localeCompare(b.seat_number, 'ko', { numeric: true })
}

export function statusLabel(s) {
  return STATUS_KO[s] || s
}

export function errMsg(e) {
  return e?.response?.data?.detail || e?.message || '오류가 발생했습니다'
}
