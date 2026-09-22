import React from 'react'
import { NavLink } from 'react-router-dom'
import { IconDashboard, IconReport, IconSeat, IconVerify } from './icons.jsx'

const SIZE = 22

// 학생 화면의 하단 탭. 순서는 화면 이동이 잦은 순.
const ITEMS = [
  { to: '/seats', label: '자리 예약', Icon: IconSeat },
  { to: '/dashboard', label: '대시보드', Icon: IconDashboard },
  { to: '/report', label: '신고', Icon: IconReport },
  { to: '/verify', label: '인증', Icon: IconVerify },
]

export default function BottomNav() {
  return (
    <nav className="ui-bottom-nav" aria-label="주요 화면">
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `ui-bottom-nav-item${isActive ? ' is-active' : ''}`}
        >
          <Icon size={SIZE} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
