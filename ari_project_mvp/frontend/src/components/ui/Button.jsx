import React from 'react'
import Spinner from './Spinner.jsx'

/**
 * 공용 버튼.
 *
 * 상태 색(초록 등) 버튼은 만들지 않는다 — 긍정 동작도 primary를 쓴다.
 * 되돌릴 수 없는 동작만 danger(흰 면 + --danger 글자·테두리)로 구분한다.
 *
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant
 * @param {'md'|'sm'} size   md = 44px, sm = 36px
 * @param {boolean} block    가로 꽉 채우기
 * @param {boolean} loading  스피너 표시 + 비활성
 */
export default function Button({
  variant = 'primary', size = 'md', block = false, loading = false,
  disabled = false, alignStart = false, className = '', children, type = 'button', ...rest
}) {
  const cls = [
    'ui-btn', `ui-btn--${variant}`,
    size === 'sm' && 'ui-btn--sm',
    block && 'ui-btn--block',
    alignStart && 'ui-btn--align-start',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={size === 'sm' ? 'sm' : 'md'} />}
      {children}
    </button>
  )
}
