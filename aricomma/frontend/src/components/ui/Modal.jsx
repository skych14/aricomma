import React, { useEffect, useRef, useState } from 'react'
import Card from './Card.jsx'

// 창 안에서 Tab으로 갈 수 있는 것들
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const visible = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement

/**
 * 화면 위에 띄우는 대화상자의 바탕. ConfirmDialog와 관리자 검토창이 함께 쓴다.
 * Esc와 바탕 클릭으로 닫힌다 (처리 중이면 onClose를 주지 않아 닫히지 않게 한다).
 *
 * 열리면 창 안 첫 입력칸(없으면 첫 버튼)으로 포커스를 옮기고, 닫히면 창을 연
 * 버튼으로 되돌린다. Tab은 창 밖으로 나가지 않고 처음↔끝을 돈다.
 *
 * @param {string} initialFocus  포커스를 먼저 줄 곳의 CSS 선택자
 *   (되돌릴 수 없는 확인창이 "취소"에 포커스를 두는 용도)
 */
export default function Modal({ title, onClose, label, initialFocus, children }) {
  const boxRef = useRef(null)   // 바탕 div — 이 안으로 포커스를 가둔다
  // 창을 연 버튼은 첫 렌더 때 잡아둔다. useEffect까지 미루면 입력칸의 autoFocus가
  // 먼저 포커스를 가져가 버려서 "원래 누른 버튼"을 놓친다.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))

  useEffect(() => {
    const box = boxRef.current
    const first = (initialFocus && box?.querySelector(initialFocus))
      || box?.querySelector('input, select, textarea')
      || box?.querySelector(FOCUSABLE)
    first?.focus()
    return () => {
      // 창을 연 버튼이 아직 화면에 있으면 그리로 되돌린다
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

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
      <Card elevated title={title} className="ui-modal">
        {children}
      </Card>
    </div>
  )
}
