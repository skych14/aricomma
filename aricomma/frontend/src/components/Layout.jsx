import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { reservationApi } from '../api/index.js'
import { AppHeader, ConfirmDialog } from './ui/index.js'

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

  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [hasActive, setHasActive] = useState(false)   // 학생의 진행 중인 예약(예약 중·이용 중)
  const isAdmin = user?.role === 'admin'

  const askLogout = () => {
    setHasActive(false)
    setConfirmingLogout(true)
    // 상단 바는 예약 정보를 모르므로 학생이면 물어본다. 못 받아오면 설명 없이 둔다.
    if (!isAdmin) {
      reservationApi.myList()
        .then(r => setHasActive(r.data.some(x => ['pending', 'checked_in'].includes(x.status))))
        .catch(() => {})
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const logoutDialog = confirmingLogout && (
    <ConfirmDialog
      title="로그아웃할까요?"
      description={hasActive ? '로그아웃해도 예약은 그대로 유지돼요.' : undefined}
      confirmLabel="로그아웃"
      onConfirm={handleLogout}
      onCancel={() => setConfirmingLogout(false)}
    />
  )

  if (isAdmin) {
    return <AdminLayout user={user} onLogout={askLogout}>{children}{logoutDialog}</AdminLayout>
  }
  return (
    <StudentLayout user={user} onLogout={askLogout} bare={bare}>
      {children}{logoutDialog}
    </StudentLayout>
  )
}
