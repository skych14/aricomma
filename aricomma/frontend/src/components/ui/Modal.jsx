import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconClose } from './icons.jsx'

// 창 안에서 Tab으로 갈 수 있는 것들
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// 겹쳐 열린 창(검토창 위 확인창)이 있어도 마지막 창이 닫힐 때만 스크롤을 푼다
let openCount = 0
let bodyStyleBefore = null

function lockBodyScroll() {
  if (openCount++ > 0) return
  const { style } = document.body
  bodyStyleBefore = { overflow: style.overflow, paddingRight: style.paddingRight }
  // 스크롤바가 사라지면서 뒤 페이지가 옆으로 밀리지 않게 그 너비만큼 채운다
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  if (scrollbar > 0) {
    const current = parseFloat(getComputedStyle(document.body).paddingRight) || 0
    style.paddingRight = `${current + scrollbar}px`
  }
  style.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (--openCount > 0 || !bodyStyleBefore) return
  document.body.style.overflow = bodyStyleBefore.overflow
  document.body.style.paddingRight = bodyStyleBefore.paddingRight
  bodyStyleBefore = null
}

const visible = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement

/**
 * 화면 위에 띄우는 대화상자의 바탕. ConfirmDialog와 관리자 검토창이 함께 쓴다.
 * Esc·바탕 클릭·제목 줄의 ✕로 닫힌다 (처리 중이면 onClose를 주지 않아 닫히지 않게
 * 하고, ✕도 숨긴다).
 *
 * 제목 줄과 버튼 줄은 제자리에 있고 그 사이 내용만 스크롤된다. 내용이 길어도
 * 버튼이 화면 밖으로 밀리지 않도록 버튼 줄은 children이 아니라 actions로 받는다.
 * 창이 열려 있는 동안 뒤 페이지는 스크롤되지 않는다.
 *
 * 열리면 창 안 첫 입력칸(없으면 첫 버튼)으로 포커스를 옮기고, 닫히면 창을 연
 * 버튼으로 되돌린다. Tab은 창 밖으로 나가지 않고 처음↔끝을 돈다.
 *
 * @param {string} initialFocus  포커스를 먼저 줄 곳의 CSS 선택자
 *   (되돌릴 수 없는 확인창이 "취소"에 포커스를 두는 용도)
 * @param {node} actions  아래에 고정할 버튼 줄 (<div className="ui-modal-actions">)
 */
export default function Modal({ title, onClose, label, initialFocus, actions, children }) {
  const boxRef = useRef(null)   // 바탕 div — 이 안으로 포커스를 가둔다
  const bodyRef = useRef(null)  // 스크롤되는 내용
  // 내용이 넘쳐 스크롤될 때만 제목 줄·버튼 줄에 구분선을 긋는다
  const [scrollable, setScrollable] = useState(false)
  // 설명 없는 확인창처럼 내용이 비면 내용 칸을 아예 두지 않는다 (제목과 버튼 사이가 벌어지지 않게)
  const hasBody = React.Children.toArray(children).length > 0
  // 창을 연 버튼은 첫 렌더 때 잡아둔다. useEffect까지 미루면 입력칸의 autoFocus가
  // 먼저 포커스를 가져가 버려서 "원래 누른 버튼"을 놓친다.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))

  useEffect(() => {
    const box = boxRef.current
    const first = (initialFocus && box?.querySelector(initialFocus))
      || box?.querySelector('input, select, textarea')
      // ✕가 맨 앞에 있지만 첫 포커스는 예전처럼 내용·버튼 줄의 첫 버튼에 둔다
      || Array.from(box?.querySelectorAll(FOCUSABLE) || []).find(el => !el.matches('.ui-modal-close'))
      || box?.querySelector(FOCUSABLE)
    // 내용 중간의 입력칸에 포커스가 가도 창은 맨 위부터 보이게 한다
    first?.focus({ preventScroll: true })
    return () => {
      // 창을 연 버튼이 아직 화면에 있으면 그리로 되돌린다
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    lockBodyScroll()
    return unlockBodyScroll
  }, [])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) { setScrollable(false); return undefined }
    const measure = () => setScrollable(body.scrollHeight > body.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    // 창 크기(화면 회전 등)와 내용 크기(목록·이미지가 늦게 뜸) 둘 다 본다
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    return () => observer.disconnect()
  }, [hasBody])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { if (onClose) onClose(); return }
      if (e.key !== 'Tab') return
      const box = boxRef.current
      if (!box) return
      const items = Array.from(box.querySelectorAll(FOCUSABLE)).filter(visible)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      // 창 밖에 포커스가 있으면(바탕 클릭 등) 다시 안으로 끌어온다
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={boxRef}
      className="ui-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label || title}
      onClick={(e) => { if (onClose && e.target === e.currentTarget) onClose() }}
    >
      <div className={`ui-card ui-card--elevated ui-modal${scrollable ? ' is-scrollable' : ''}`}>
        <div className="ui-modal-head">
          <h2 className="ui-card-title">{title}</h2>
          {onClose && (
            <button type="button" className="ui-modal-close" aria-label="닫기" onClick={onClose}>
              <IconClose size={22} aria-hidden="true" />
            </button>
          )}
        </div>
        {hasBody && (
          <div ref={bodyRef} className="ui-modal-body">
            <div className="ui-modal-content">{children}</div>
          </div>
        )}
        {actions}
      </div>
    </div>
  )
}
