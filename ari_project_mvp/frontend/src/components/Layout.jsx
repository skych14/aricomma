import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

function StudentLayout({ user, onLogout, children }) {
  return (
    <div className="app-layout">
      <header className="header">
        <span className="header-brand">🛏️ 아리쉼표</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.82rem', color: 'rgba(255,255,255,.8)' }}>{user.name}</span>
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="bottom-nav">
        <NavLink to="/seats" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <span className="bottom-nav-icon">🛏️</span>
          <span>좌석 예약</span>
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <span className="bottom-nav-icon">🏠</span>
          <span>대시보드</span>
        </NavLink>
        <NavLink to="/verify" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <span className="bottom-nav-icon">📋</span>
          <span>인증</span>
        </NavLink>
      </nav>
    </div>
  )
}

function AdminLayout({ user, onLogout, children }) {
  return (
    <div className="app-layout">
      <header className="header">
        <NavLink to="/admin" className="header-brand">🛏️ 아리쉼표</NavLink>
        <nav className="header-nav">
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>관리자</NavLink>
          <span style={{ fontSize: '.82rem', color: 'rgba(255,255,255,.8)', marginLeft: 4 }}>{user.name}</span>
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </nav>
      </header>
      <main className="app-main app-main--wide">{children}</main>
    </div>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (user?.role === 'admin') {
    return <AdminLayout user={user} onLogout={handleLogout}>{children}</AdminLayout>
  }
  return <StudentLayout user={user} onLogout={handleLogout}>{children}</StudentLayout>
}
