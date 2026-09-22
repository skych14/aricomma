import React from 'react'

/**
 * 화면 제목. 기본은 --ink, 주황 강조가 필요하면 tone="brand"(--brand-text).
 * action을 주면 제목 오른쪽에 버튼 자리를 만든다.
 */
export default function PageTitle({ tone = 'ink', action, children }) {
  const title = (
    <h1 className={`ui-page-title${tone === 'brand' ? ' ui-page-title--brand' : ''}`}>
      {children}
    </h1>
  )
  if (!action) return title
  return <div className="ui-page-head">{title}{action}</div>
}
