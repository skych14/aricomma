import React from 'react'

const ICON_SIZE = 40

/**
 * 홈 화면 "무엇을 도와드릴까요?" 카드 안의 2×2 타일 버튼.
 *
 * 흐림 상태는 투명도가 아니라 색으로만 만든다 (--surface-page 면 + --ink-muted
 * 글자 = 5.0:1). .ui-btn을 쓰지 않는 이유도 같다 — .ui-btn:disabled의 opacity .5가
 * 글자 대비를 4.5:1 아래로 떨어뜨린다.
 *
 * @param {React.ComponentType} icon  lucide 아이콘 컴포넌트 (크기·굵기는 여기서 정한다)
 * @param {string} label   타일 글자
 * @param {string} note    글자 아래 한 줄 — 켜짐이면 안내("마감 15:11"), 흐림이면 그 이유
 * @param {boolean} disabled
 */
export default function HomeTile({
  icon: Icon, label, note, disabled = false, className = '', ...rest
}) {
  return (
    <button
      type="button"
      className={`ui-home-tile${disabled ? ' is-off' : ''} ${className}`.trim()}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {Icon && <Icon size={ICON_SIZE} strokeWidth={1.5} aria-hidden="true" />}
      <span className="ui-home-tile-label">{label}</span>
      {note && <span className="ui-home-tile-note">{note}</span>}
    </button>
  )
}
