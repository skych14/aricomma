import React from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * 알약형 메뉴 줄 — 왼쪽 아이콘 · 가운데 글자 · 오른쪽 ›.
 * 피그마 "더보기" 화면용. to를 주면 링크처럼 쓸 수 있도록 as로 감싼다.
 */
export default function MenuItem({ icon, children, as = 'button', className = '', ...rest }) {
  const Tag = as
  return (
    <Tag className={`ui-menu-item ${className}`} {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      {icon && <span className="ui-menu-item-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-menu-item-label">{children}</span>
      <span className="ui-menu-item-chevron" aria-hidden="true"><ChevronRight size={20} /></span>
    </Tag>
  )
}
