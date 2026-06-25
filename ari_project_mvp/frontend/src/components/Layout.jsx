import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <header className="header">
        <NavLink to={user?.role === 'admin' ? '/admin' : '/dashboard'} className="header-brand">
          🛏️ 아리쉼표
        </NavLink>
        {user && (
          <nav className="header-nav">
            {user.role === 'admin' ? (
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>관리자</NavLink>
            ) : (
              <>
                <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>대시보드</NavLink>
                <NavLink to="/verify" className={({ isActive }) => isActive ? 'active' : ''}>인증</NavLink>
                <NavLink to="/seats" className={({ isActive }) => isActive ? 'active' : ''}>좌석 예약</NavLink>
              </>
            )}
            <span className="text-muted" style={{ fontSize: '.82rem', marginLeft: 4 }}>{user.name}</span>
            <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
          </nav>
        )}
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
