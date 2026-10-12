import React, { Fragment } from 'react'
import useIsMobile from '../../utils/useIsMobile.js'
import EmptyState from './EmptyState.jsx'

const filled = (v) => v !== null && v !== undefined && v !== '' && v !== false

/**
 * 같은 열 정의로 PC에서는 표, 휴대폰(640px 이하)에서는 카드 목록을 그린다.
 * 데이터·정렬·필터는 부르는 쪽이 한 번만 하고, 여기서는 배치만 바꾼다.
 *
 * 카드: 맨 위 제목 줄(cardTitle) + 나머지 칸 전부를 "칸 이름: 값" 두 칸 격자로.
 * PC 표의 열 이름이 그대로 칸 이름이 된다 — 휴대폰에서 빠지는 칸이 없어야 한다.
 *
 * @param {Array}  columns     [{ key, label, cell: row => node, className }]
 * @param {Object} cardTitle   { main: [key...], end: [key...] } 제목 줄 왼쪽·오른쪽에 둘 열
 * @param {Array}  cardBody    격자에 둘 열 key (기본: 제목 줄에 없는 열 전부)
 * @param {*}      openKey     펼쳐진 행의 key (renderDetail을 줄 때)
 * @param {func}   onToggle    행/카드를 눌렀을 때 (key)
 * @param {func}   renderDetail  펼친 내용
 */
export default function DataList({
  columns, rows, rowKey, cardTitle = { main: [], end: [] }, cardBody,
  empty = '내역 없음', openKey, onToggle, renderDetail,
}) {
  const mobile = useIsMobile()
  const expandable = !!renderDetail
  const byKey = Object.fromEntries(columns.map(c => [c.key, c]))
  const value = (c, row) => { const v = c.cell(row); return filled(v) ? v : '—' }

  // 표의 행과 카드가 같은 방식으로 펼쳐지게 (클릭·Enter·Space)
  const toggleProps = (key, open) => (expandable ? {
    tabIndex: 0,
    'aria-expanded': open,
    onClick: () => onToggle(key),
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(key) }
    },
  } : {})

  if (mobile) {
    const main = (cardTitle.main || []).map(k => byKey[k])
    const end = (cardTitle.end || []).map(k => byKey[k])
    const titleKeys = [...(cardTitle.main || []), ...(cardTitle.end || [])]
    const body = cardBody
      ? cardBody.map(k => byKey[k])
      : columns.filter(c => !titleKeys.includes(c.key))

    if (rows.length === 0) return <EmptyState title={empty} compact />
    return (
      <ul className="data-cards">
        {rows.map(row => {
          const key = rowKey(row)
          const open = expandable && openKey === key
          return (
            <li key={key} data-row-id={key}
              className={`data-card${expandable ? ' data-card--toggle' : ''}${open ? ' is-open' : ''}`}
              {...toggleProps(key, open)}>
              <div className="data-card-title">
                <div className="data-card-title-main">
                  {main.map(c => <span key={c.key} data-col={c.label}>{value(c, row)}</span>)}
                </div>
                {end.length > 0 && (
                  <div className="data-card-title-end">
                    {end.map(c => <span key={c.key} data-col={c.label}>{value(c, row)}</span>)}
                  </div>
                )}
              </div>
              <dl className="data-card-fields">
                {body.map(c => (
                  <div key={c.key} className="data-card-field">
                    <dt>{c.label}</dt>
                    <dd>{value(c, row)}</dd>
                  </div>
                ))}
              </dl>
              {open && (
                <div className="data-card-detail" onClick={e => e.stopPropagation()}>
                  {renderDetail(row)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const key = rowKey(row)
            const open = expandable && openKey === key
            return (
              <Fragment key={key}>
                <tr data-row-id={key}
                  className={expandable ? `audit-row${open ? ' is-open' : ''}` : undefined}
                  {...toggleProps(key, open)}>
                  {columns.map(c => <td key={c.key} className={c.className}>{value(c, row)}</td>)}
                </tr>
                {open && (
                  <tr className="audit-detail">
                    <td colSpan={columns.length}>{renderDetail(row)}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length}><EmptyState title={empty} compact /></td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
