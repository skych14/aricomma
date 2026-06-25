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
}

export function statusLabel(s) {
  return STATUS_KO[s] || s
}

export function statusBadgeClass(s) {
  if (['approved', 'completed', 'checked_in', 'available'].includes(s)) return 'badge-approved'
  if (['pending', 'reserved'].includes(s)) return 'badge-pending'
  if (['rejected', 'expired', 'cancelled', 'occupied'].includes(s)) return 'badge-rejected'
  return ''
}

export function errMsg(e) {
  return e?.response?.data?.detail || e?.message || '오류가 발생했습니다'
}
