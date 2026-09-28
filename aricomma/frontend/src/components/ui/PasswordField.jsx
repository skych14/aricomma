import React, { useState } from 'react'
import TextField from './TextField.jsx'
import { IconHide, IconShow } from './icons.jsx'

const ICON = 20

/**
 * 비밀번호 입력칸 + 오른쪽 보기/숨기기 단추.
 *
 * 화면을 가린 채로 긴 비밀번호를 치다 보면 틀리기 쉬워서 직접 보고 고칠 수
 * 있게 한다. 단추는 입력칸 안에 겹쳐 놓지만 터치 영역은 44px을 지킨다.
 */
export default function PasswordField({ className = '', ...rest }) {
  const [shown, setShown] = useState(false)
  return (
    <div className={`ui-password ${className}`.trim()}>
      <TextField type={shown ? 'text' : 'password'} {...rest} />
      <button
        type="button"
        className="ui-password-toggle"
        aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
        aria-pressed={shown}
        onClick={() => setShown(v => !v)}
      >
        {shown ? <IconHide size={ICON} aria-hidden="true" /> : <IconShow size={ICON} aria-hidden="true" />}
      </button>
    </div>
  )
}
