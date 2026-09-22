import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { AppHeader, BottomNav } from './ui/index.js'

function StudentLayout({ user, onLogout, children }) {
  return (
    <div className="app-layout">
      <AppHeader userName={user.name} onLogout={onLogout} />
      <main className="app-main">{children}</main>
      <BottomNav />
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
