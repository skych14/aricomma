import React from 'react'

/** "내역 없음" 같은 빈 상태. action에 버튼을 넣을 수 있다. */
export default function EmptyState({ icon, title = '내역이 없습니다', action, compact = false, children }) {
  return (
    <div className={`ui-empty${compact ? ' ui-empty--row' : ''}`}>
      {icon && <span className="ui-empty-icon" aria-hidden="true">{icon}</span>}
      <span>{title}</span>
      {children}
      {action}
    </div>
  )
}
