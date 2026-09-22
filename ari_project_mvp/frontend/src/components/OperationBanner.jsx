import React from 'react'
import { fmtDuration, fmtTime, kstHour } from '../utils/helpers.js'
import { Notice } from './ui/index.js'

// 24시간 모드에서 밤 규칙(22:00~)을 미리 알려줄 구간
const EVENING_HINT_FROM = 19
const NIGHT_START = 22

/**
 * 좌석 화면 상단 운영 안내 배너.
 * op는 GET /api/settings/operation 응답. 아직 못 받았으면 아무것도 그리지 않는다.
 */
export default function OperationBanner({ op }) {
  if (!op) return null

  const usage = fmtDuration(op.usage_minutes_if_checkin_now)

  // ── 7시간 모드 ──
  if (op.mode === 'standard') {
    if (!op.is_open_now) {
      return (
        <Notice tone="neutral" title="지금은 이용 시간이 아니에요">
          {fmtTime(op.next_open_at)}부터 예약할 수 있어요
        </Notice>
      )
    }
    return (
      <Notice tone="info" title={`오늘 이용 시간 ${fmtTime(op.opens_at)}~${fmtTime(op.closes_at)}`}>
        기본 2시간 · 지금 체크인하면 {fmtTime(op.usage_ends_at_if_checkin_now)}까지 ({usage})
      </Notice>
    )
  }

  // ── 24시간 모드 ──
  const hour = kstHour(op.now)
  let hint = null
  if (op.night_rule_active) {
    hint = `지금 체크인하면 ${fmtTime(op.usage_ends_at_if_checkin_now)}까지 이용할 수 있어요 (${usage})`
  } else if (hour !== null && hour >= EVENING_HINT_FROM && hour < NIGHT_START) {
    hint = '22:00부터 체크인하면 최대 7시간 이용할 수 있어요'
  } else {
    hint = `지금 체크인하면 ${fmtTime(op.usage_ends_at_if_checkin_now)}까지 이용할 수 있어요`
  }

  // 시험기간 24시간은 특별 운영이라 브랜드 면으로 강조 (주황 위 글자는 --ink)
  return (
    <Notice tone="brand" title="시험기간 24시간 개방 · 기본 2시간">{hint}</Notice>
  )
}
