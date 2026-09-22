import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { AppHeader } from './ui/index.js'

/* 학생 화면에는 하단 탭바를 두지 않는다 (홈 화면이 그 자리를 대신한다).
   BottomNav 부품 자체는 남겨두되 어디서도 쓰지 않는다. */
function StudentLayout({ user, onLogout, bare, children }) {
  // bare = 홈·더보기처럼 화면 자체가 진입점인 곳: 상단 바 없이 피그마 여백만
  if (bare) {
    return (
      <div className="app-layout">
        <main className="app-main app-main--bare">{children}</main>
      </div>
    )
  }
  return (
    <div className="app-layout">
      <AppHeader to="/home" userName={user.name} onLogout={onLogout} />
      <main className="app-main">{children}</main>
    </div>
  )
}

function AdminLayout({ user, onLogout, children }) {
  return (
    <div className="app-layout">
      <AppHeader to="/admin" userName={user.name} onLogout={onLogout} />
      <main className="app-main app-main--wide">{children}</main>
    </div>
  )
}

export default function Layout({ bare = false, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (user?.role === 'admin') {
    return <AdminLayout user={user} onLogout={handleLogout}>{children}</AdminLayout>
  }
  return <StudentLayout user={user} onLogout={handleLogout} bare={bare}>{children}</StudentLayout>
}
