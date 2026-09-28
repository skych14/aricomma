import React from 'react'
import { Accessibility } from 'lucide-react'

const STATUS_TEXT = {
  available: '이용가능',
  unavailable: '이용불가',
  selected: '이용가능',
  'reserved-by-me': '내 자리',
}

/**
 * 배치도의 좌석 한 칸. 기본 크기는 토큰(--seat-width 95 × --seat-height 66).
 *
 * 굴방 평면도처럼 좌석을 비율(%)로 놓아야 하는 곳은 free를 주고 style로 위치·크기를
 * 넘긴다 (인라인 style이 클래스의 고정 크기를 덮어쓴다).
 *
 * 보기 전용(readOnly)은 진행 중인 예약이 있어 고를 수 없는 현황 화면용이다.
 * 흐리게 만들지 않는다 — 어디가 비었는지는 그대로 읽혀야 하므로 면·빗금은 두고
 * 누를 수 없다는 것만 aria-disabled와 커서로 알린다.
 *
 * @param {'available'|'unavailable'|'selected'|'reserved-by-me'} status
 * @param {boolean} accessible  배려석(♿) 표시
 * @param {boolean} free        크기를 style로 직접 정하는 배치 (평면도)
 * @param {boolean} readOnly    고를 수 없는 현황 표시
 */
export default function SeatTile({
  seatNumber, floor, status = 'available', accessible = false,
  free = false, readOnly = false, className = '', style, onSelect, ...rest
}) {
  const selected = status === 'selected'
  const mine = status === 'reserved-by-me'
  const disabled = status === 'unavailable'
  const statusText = STATUS_TEXT[status]

  const cls = [
    'ui-seat',
    disabled ? 'ui-seat--unavailable' : 'ui-seat--available',
    selected && 'ui-seat--selected',
    mine && 'ui-seat--mine',
    free && 'ui-seat--free',
    readOnly && 'ui-seat--readonly',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={cls}
      style={style}
      disabled={disabled}
      aria-disabled={readOnly || undefined}
      aria-pressed={disabled || readOnly ? undefined : selected}
      aria-label={[
        seatNumber,
        floor != null ? `${floor}층` : null,
        statusText,
        accessible ? '장애인 배려 권장석' : null,
      ].filter(Boolean).join(', ')}
      onClick={readOnly ? undefined : onSelect}
      {...rest}
    >
      <span className="ui-seat-number">{seatNumber}</span>
      <span className="ui-seat-status">
        {statusText}
        {accessible && (
          <span className="ui-seat-accessible" aria-hidden="true">
            <Accessibility size={14} strokeWidth={2.25} />
          </span>
        )}
      </span>
    </button>
  )
}
