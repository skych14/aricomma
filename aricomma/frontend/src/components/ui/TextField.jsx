import React, { forwardRef, useId } from 'react'

/**
 * 라벨·힌트·오류를 함께 다루는 입력칸.
 *
 * as="select" / "textarea"로 같은 겉모습의 선택칸·여러 줄 입력칸을 만든다
 * (화면마다 select에 .form-input을 직접 붙이던 것을 여기로 모은다).
 *
 * @param {string} label
 * @param {string} hint   평상시 도움말
 * @param {string} error  오류 문구 — 있으면 테두리가 --danger가 되고 hint 대신 표시된다
 */
const TextField = forwardRef(function TextField({
  as = 'input', label, labelNote, hint, error, id, className = '',
  inline = false, children, ...rest
}, ref) {
  const autoId = useId()
  const fieldId = id || autoId
  const Tag = as

  return (
    <div className={`ui-field${inline ? ' ui-field--inline' : ''} ${className}`}>
      {label && (
        <label className="ui-field-label" htmlFor={fieldId}>
          {label}
          {labelNote && <span className="ui-field-optional"> {labelNote}</span>}
        </label>
      )}
      <Tag
        ref={ref}
        id={fieldId}
        className={`ui-input${error ? ' is-error' : ''}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </Tag>
      {error
        ? <div className="ui-field-error">{error}</div>
        : hint ? <div className="ui-field-hint">{hint}</div> : null}
    </div>
  )
})

export default TextField
