import React from 'react'
import { statusLabel } from '../../utils/helpers.js'

/* 상태 → 면 색 매핑을 한 곳에 모은다.
   예약·인증·신고·좌석이 같은 키(pending 등)를 쓰므로 키 하나로 통일한다.
   글자/면 대비는 모두 4.5:1 이상 (tokens.css의 --success/--warning/--danger 조합). */
const TONES = {
  // 끝난 것 · 정상
  approved: 'ok', completed: 'ok', checked_in: 'ok', available: 'ok',
  penalized: 'ok', checkout: 'ok', checkin: 'ok',
  // 기다리는 중
  pending: 'wait', reserved: 'wait-hatch',
  // 안 된 것
  rejected: 'bad', expired: 'bad', cancelled: 'bad', no_target: 'bad',
  occupied: 'bad-hatch',
}

/**
 * 예약·인증·신고·좌석 상태 배지.
 *
 * @param {string} status  상태 키 (pending, checked_in, ...)
 * @param {string} label   백엔드가 내려준 표시 문구가 있으면 그 값 (없으면 statusLabel)
 * @param {string} tone    상태가 아닌 구분(관리자·성별 등)에 쓸 때 직접 지정
 */
export default function StatusBadge({ status, label, tone, className = '' }) {
  const t = tone || TONES[status] || 'neutral'
  return (
    <span className={`ui-badge ui-badge--${t} ${className}`}>
      {label ?? statusLabel(status)}
    </span>
  )
}
