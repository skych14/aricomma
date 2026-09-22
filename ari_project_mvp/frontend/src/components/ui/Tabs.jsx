import React from 'react'

/**
 * 세그먼트 탭. 활성 탭은 --brand-text + 2px --brand-strong 밑줄.
 *
 * @param {Array} items  [{ key, label, icon, count, badge, disabled }]
 *                       count = "(3/8)" 처럼 옆에 붙는 숫자, badge = 빨간 알림 숫자
 * @param {boolean} fill 탭이 화면 폭을 똑같이 나눠 가질 때 (남/여 학우실 등)
 */
export default function Tabs({ items, value, onChange, fill = false, label, className = '' }) {
  return (
    <div className={`ui-tabs${fill ? ' ui-tabs--fill' : ''} ${className}`} role="tablist" aria-label={label}>
      {items.map(t => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            className={`ui-tab${active ? ' is-active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.icon}
            {t.label}
            {t.count != null && <span className="ui-tab-count">{t.count}</span>}
            {t.badge > 0 && <span className="ui-badge-count">{t.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
