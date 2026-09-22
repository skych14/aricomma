import React from 'react'

/**
 * 안내 박스. 화면마다 쓰던 .alert / .verify-status / .op-banner를 하나로 모은 것.
 *
 * tone
 * - info    : --surface-page 면 (상태가 아닌 안내)
 * - brand   : --brand-soft 면 (강조하고 싶은 운영 안내. 주황 위 글자는 --ink)
 * - neutral : 회색 면 (꺼져 있음·해당 없음)
 * - success / warning / danger : 각 상태 -bg 면 + 상태 글자 (뜻이 있을 때만)
 *
 * @param {string} title     굵은 첫 줄
 * @param {node}   action    아래쪽 버튼 자리
 * @param {boolean} lg       주인공 안내 (제목을 --fs-title로)
 */
export default function Notice({
  tone = 'info', title, action, lg = false, center = false,
  className = '', children, ...rest
}) {
  const cls = [
    'ui-notice', `ui-notice--${tone}`,
    lg && 'ui-notice--lg',
    center && 'ui-notice--center',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} {...rest}>
      {title && <strong className="ui-notice-title">{title}</strong>}
      {children && <div className="ui-notice-body">{children}</div>}
      {action && <div className="ui-notice-action">{action}</div>}
    </div>
  )
}
