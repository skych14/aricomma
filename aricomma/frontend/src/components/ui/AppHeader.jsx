import React from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo.jsx'
import Button from './Button.jsx'

/**
 * 상단 바 — 왼쪽 로고(mark + "아리쉼표" 워드마크), 오른쪽 사용자 이름·로그아웃.
 * 워드마크 글자 크기는 ui.css의 .ui-header-logo가 18px로 정한다.
 */
export default function AppHeader({ userName, onLogout, to, right }) {
  const logo = <Logo variant="mark" size={32} wordmark className="ui-header-logo" />

  return (
    <header className="ui-header">
      {to ? <Link to={to} className="ui-header-logo">{logo}</Link> : logo}
      <div className="ui-header-right">
        {right}
        {userName && <span className="ui-header-name">{userName}</span>}
        {onLogout && <Button variant="secondary" size="sm" onClick={onLogout}>로그아웃</Button>}
      </div>
    </header>
  )
}
