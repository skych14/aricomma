import React, { useEffect } from 'react'
import Card from './Card.jsx'

/**
 * 화면 위에 띄우는 대화상자의 바탕. ConfirmDialog와 관리자 검토창이 함께 쓴다.
 * Esc와 바탕 클릭으로 닫힌다 (처리 중이면 onClose를 주지 않아 닫히지 않게 한다).
 */
export default function Modal({ title, onClose, label, children }) {
  useEffect(() => {
    if (!onClose) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
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
