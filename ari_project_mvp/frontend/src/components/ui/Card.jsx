import React from 'react'

/**
 * 흰 면 카드. 장식(왼쪽 세로줄 등)은 붙이지 않는다.
 *
 * @param {boolean} elevated  그림자 — 한 화면의 주인공 카드에만
 * @param {boolean} flat      그림자 대신 1px 테두리 (목록 안 카드)
 * @param {string}  title     카드 제목
 * @param {string}  as        감싸는 태그 (폼 카드면 'form')
 */
export default function Card({
  elevated = false, flat = false, title, titleAction,
  as = 'div', className = '', children, ...rest
}) {
  const Tag = as
  const cls = [
    'ui-card',
    elevated && 'ui-card--elevated',
    flat && 'ui-card--flat',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={cls} {...rest}>
      {title && (
        titleAction
          ? <div className="ui-page-head"><h2 className="ui-card-title">{title}</h2>{titleAction}</div>
          : <h2 className="ui-card-title">{title}</h2>
      )}
      {children}
    </Tag>
  )
}
