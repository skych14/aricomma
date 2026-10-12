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

/** 한국시간 "오전 2:00" / "오후 2:17" — 24시간 표기가 헷갈리는 학생 화면용. */
export function fmtTime12(iso) {
  if (!iso) return '—'
  return parseUTC(iso).toLocaleTimeString('ko-KR', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Seoul',
  })
}

/** 한국시간 "10. 12." — 시각 앞에 붙여 며칠 일인지 알 수 있게 한다. */
export function fmtMonthDay(iso) {
  if (!iso) return '—'
  return parseUTC(iso).toLocaleDateString('ko-KR', {
    month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  })
}

/**
 * 지금이 연장 가능 시간대(종료 30분 전 ~ 종료 전)인지.
 * 시각 계산은 서버가 내려준 extendable_from·usage_ends_at만 쓴다.
 */
export function inExtendWindow(r, nowMs = Date.now()) {
  if (r?.status !== 'checked_in' || !r.extendable_from || !r.usage_ends_at) return false
  return nowMs >= parseUTC(r.extendable_from).getTime()
    && nowMs < parseUTC(r.usage_ends_at).getTime()
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
  { key: 'no_checkout', label: '미퇴실', desc: '이용 시간이 끝났는데 안 나가거나, 예약 없이 쓰고 있어요' },
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

// 이용 로그(UsageLog)의 action은 예약 '상태'가 아니라 '사건'이라 따로 둔다
const ACTION_KO = {
  reserved: '예약',
  checked_in: '체크인',
  extended: '연장',
  checked_out: '퇴실',
  cancelled: '예약 취소',
  expired: '만료',
}

export function actionLabel(a) {
  return ACTION_KO[a] || a
}

// 감사 로그(AuditLog)의 action_type. 드롭다운이 이 순서대로 보여준다.
// SEAT_CREATE·SEAT_DELETE는 지금은 기록되지 않지만 예전 기록을 읽기 위해 남겨 둔다.
export const AUDIT_ACTION_KO = {
  USER_LOGIN: '로그인',
  LOGIN_FAILED: '로그인 실패',
  LOGIN_LOCKED: '로그인 잠금',
  LOGIN_RATE_LIMITED: '요청 과다 차단',
  LOGIN_SPRAY_BLOCKED: '로그인 일시 차단',
  USER_REGISTER: '회원가입',
  PASSWORD_CHANGE: '비밀번호 변경',
  USER_TEMP_PASSWORD: '임시 비밀번호 발급',
  USER_UPDATE: '사용자 상태 변경',
  USER_DELETE: '계정 삭제',
  USER_WITHDRAW: '회원 탈퇴',
  VERIFICATION_SUBMIT: '인증 제출',
  VERIFICATION_APPROVE: '인증 승인',
  VERIFICATION_REJECT: '인증 거절',
  RESERVATION_CREATE: '예약',
  RESERVATION_CANCEL: '예약 취소',
  RESERVATION_EXPIRED: '예약 만료',
  CHECKIN: '체크인',
  RESERVATION_EXTEND: '이용 연장',
  CHECKOUT: '퇴실',
  RESERVATION_AUTO_CHECKOUT: '자동 퇴실',
  REPORT_CREATE: '신고 접수',
  REPORT_REVIEW: '신고 처리',
  PENALTY_ISSUE: '패널티 부과',
  PENALTY_REVOKE: '패널티 철회',
  PENALTY_COUNTER_RESET: '누적 횟수 초기화',
  SUSPENSION_LIFTED: '정지 자동 해제',
  MODE_CHANGE: '운영 모드 변경',
  SEAT_UPDATE: '자리 설정 변경',
  QR_ROTATE: 'QR 재발급',
  SEAT_CREATE: '자리 추가',
  SEAT_DELETE: '자리 삭제',
}

export function auditActionLabel(code) {
  return AUDIT_ACTION_KO[code] || code
}

/** 자리 이름은 항상 방까지 — 번호가 방마다 겹친다 (남/여 일반방 모두 A2-2). */
export function seatLabel(location, seatNumber) {
  return [location, seatNumber].filter(Boolean).join(' ') || '—'
}

// 감사 로그의 대상 종류(target_type)
const TARGET_TYPE_KO = {
  user: '사용자', reservation: '예약', seat: '자리', verification: '인증',
  report: '신고', setting: '설정', ip: 'IP', email: '이메일',
}

export function targetTypeLabel(type) {
  return type ? (TARGET_TYPE_KO[type] || type) : '—'
}

// 감사 로그 상세(detail)의 항목 이름. 여기 없는 항목은 원래 이름 그대로 보여준다.
const AUDIT_DETAIL_KO = {
  seat_number: '자리 번호', mode: '운영 모드', usage_ends_at: '종료 예정',
  previous_usage_ends_at: '이전 종료 예정', extension_count: '연장 횟수',
  student_id: '학번', email: '이메일', name: '이름', is_suspended: '정지',
  is_verified: '인증', reason: '사유', failed_count: '실패 횟수',
  locked_until: '잠금 해제', level: '단계', ends_at: '종료', admin_note: '메모',
  action: '처리', category: '유형', from: '변경 전', to: '변경 후',
  file_deleted: '파일 삭제', cancelled: '취소된 예약', checked_out: '퇴실 처리된 예약',
  threshold: '기준', block_seconds: '차단 시간(초)', path: '경로',
}

export function auditDetailLabel(key) {
  return AUDIT_DETAIL_KO[key] || key
}

/** seat_id·user_id 같은 내부 ID 항목인지 (학번 student_id는 사람이 읽는 값이라 제외) */
export function isAuditIdKey(key) {
  return /(^|_)id$/.test(key) && !AUDIT_DETAIL_KO[key]
}

// 감사 로그 상세의 코드 값 → 사람이 읽는 말
const AUDIT_VALUE_KO = {
  true: '예', false: '아니오', True: '예', False: '아니오',
  standard: '평상시', extended: '시험기간',
  ...Object.fromEntries(PENALTY_LEVELS.map(l => [l.key, l.label])),
  ...Object.fromEntries(REPORT_CATEGORIES.map(c => [c.key, c.label])),
  penalize: '패널티 부과', no_target: '대상 확인 불가', reject: '반려',
}

const UTC_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/

/** 감사 로그 상세 값. 날짜·시각은 UTC로 보고 한국시간 "10. 12. 18:00"으로 바꾼다. */
export function auditDetailValue(v) {
  if (v === null || v === undefined || v === 'None') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (Object.hasOwn(AUDIT_VALUE_KO, s)) return AUDIT_VALUE_KO[s]
  if (UTC_DATETIME.test(s)) {
    const iso = s.replace(' ', 'T')
    return `${fmtMonthDay(iso)} ${fmtTime(iso)}`
  }
  return s
}

export function errMsg(e) {
  return e?.response?.data?.detail || e?.message || '오류가 발생했습니다'
}
