import React from 'react'
import { Accessibility } from 'lucide-react'

const STATUS_TEXT = {
  available: '이용가능',
  unavailable: '이용불가',
  selected: '이용가능',
  'reserved-by-me': '내 예약',
}

/**
 * 배치도의 좌석 한 칸. 기본 크기는 토큰(--seat-width 95 × --seat-height 66).
 *
 * 굴방 평면도처럼 좌석을 비율(%)로 놓아야 하는 곳은 free를 주고 style로 위치·크기를
 * 넘긴다 (인라인 style이 클래스의 고정 크기를 덮어쓴다).
 *
 * @param {'available'|'unavailable'|'selected'|'reserved-by-me'} status
 * @param {boolean} accessible  배려석(♿) 표시
 * @param {boolean} free        크기를 style로 직접 정하는 배치 (평면도)
 */
export default function SeatTile({
  seatNumber, floor, status = 'available', accessible = false,
  free = false, className = '', style, onSelect, ...rest
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
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={cls}
      style={style}
      disabled={disabled}
      aria-pressed={disabled ? undefined : selected}
      aria-label={[
        seatNumber,
        floor != null ? `${floor}층` : null,
        statusText,
        accessible ? '장애인 배려 권장석' : null,
      ].filter(Boolean).join(', ')}
      onClick={onSelect}
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
