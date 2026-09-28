import React from 'react'
import { IconMet, IconUnmet } from './icons.jsx'

const ICON = 16

/**
 * 비밀번호 규칙을 치는 동안 보여준다 — 틀린 뒤에 알려주지 않으려는 것.
 * 규칙은 백엔드 utils/password_policy.py와 같은 값을 쓴다.
 */
export const PASSWORD_MIN = 10

/** 각 줄의 충족 여부. studentId를 주면 "학번 미포함"까지 본다. */
export function passwordChecks(password = '', studentId = '') {
  // 학번에 영문이 섞일 수 있어(2021E7312) 대소문자를 구분하지 않고 본다
  const sid = (studentId || '').trim().toUpperCase()
  return [
    { key: 'length', label: `${PASSWORD_MIN}자 이상`, met: password.length >= PASSWORD_MIN },
    {
      key: 'mix',
      label: '영문과 숫자 포함',
      met: /[a-zA-Z]/.test(password) && /\d/.test(password),
    },
    {
      key: 'student',
      label: '학번 미포함',
      // 학번을 아직 안 적었으면 어길 방법이 없으므로 충족으로 본다
      met: !sid || !password.toUpperCase().includes(sid),
    },
  ]
}

export const passwordOk = (password, studentId) =>
  passwordChecks(password, studentId).every(c => c.met)

/**
 * 충족·미충족을 색만으로 나누지 않는다 — 아이콘 모양(●/○)과 숨김 글자로도 구분된다.
 */
export default function PasswordChecklist({ password, studentId, className = '' }) {
  return (
    <ul className={`ui-checklist ${className}`.trim()}>
      {passwordChecks(password, studentId).map(({ key, label, met }) => (
        <li key={key} className={`ui-checklist-item${met ? ' is-met' : ''}`}>
          {met
            ? <IconMet size={ICON} aria-hidden="true" />
            : <IconUnmet size={ICON} aria-hidden="true" />}
          {label}
          <span className="sr-only">{met ? ' 충족' : ' 미충족'}</span>
        </li>
      ))}
    </ul>
  )
}
