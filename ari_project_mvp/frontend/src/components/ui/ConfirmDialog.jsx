import React, { useState } from 'react'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import Notice from './Notice.jsx'
import TextField from './TextField.jsx'

/**
 * window.confirm을 대신하는 화면 내 확인창.
 *
 * 계정 삭제처럼 되돌릴 수 없는 동작은 confirmWord(학번 등)를 주면
 * 그 값을 그대로 입력해야만 확인 버튼이 열린다.
 *
 * tone="danger"면 엔터 한 번에 실행되지 않도록 "취소"에 포커스를 두고 연다.
 * (입력칸이 있으면 입력칸이 먼저다 — 어차피 입력 전에는 확인 버튼이 잠겨 있다.)
 *
 * @param {string} title
 * @param {node}   description   설명 (줄바꿈 그대로 표시)
 * @param {string} confirmLabel  확인 버튼 글자
 * @param {'primary'|'danger'} tone  되돌릴 수 없으면 danger
 * @param {string} confirmWord   입력 확인이 필요할 때 대조할 값
 * @param {string} error         서버 오류 문구
 * @param {boolean} busy         처리 중 (버튼 스피너 + 닫기 잠금)
 */
export default function ConfirmDialog({
  title, description, confirmLabel = '확인', cancelLabel = '취소',
  tone = 'primary', confirmWord, confirmWordLabel = '확인을 위해 다시 입력하세요',
  error, busy = false, onConfirm, onCancel,
}) {
  const [typed, setTyped] = useState('')
  const matched = !confirmWord || typed.trim() === confirmWord

  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onCancel}
      initialFocus={tone === 'danger' && !confirmWord ? '[data-confirm-cancel]' : undefined}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {description && <p className="ui-modal-desc">{description}</p>}

      {confirmWord && (
        <TextField
          label={confirmWordLabel}
          value={typed}
          autoFocus
          placeholder={confirmWord}
          onChange={e => setTyped(e.target.value)}
        />
      )}

      <div className="ui-modal-actions">
        <Button variant={tone} loading={busy} disabled={!matched} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel} data-confirm-cancel="">
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  )
}
