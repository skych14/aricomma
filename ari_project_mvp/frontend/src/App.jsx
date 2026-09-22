import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { LoadingBox } from './components/ui/index.js'
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import UiKitPage from './pages/admin/UiKitPage.jsx'
import HomePage from './pages/student/HomePage.jsx'
import MorePage from './pages/student/MorePage.jsx'
import MySeatPage from './pages/student/MySeatPage.jsx'
import SeatsPage from './pages/student/SeatsPage.jsx'
import ReportPage from './pages/student/ReportPage.jsx'
import VerificationPage from './pages/student/VerificationPage.jsx'

// 무거운 QR 라이브러리(html5-qrcode, qrcode.react)는 해당 화면에서만 받아오도록 분리
const CheckinPage = lazy(() => import('./pages/student/CheckinPage.jsx'))
const QrPrintPage = lazy(() => import('./pages/admin/QrPrintPage.jsx'))

function PageFallback() {
  return <LoadingBox />
}

function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/home" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/home" element={
            <ProtectedRoute><Layout bare><HomePage /></Layout></ProtectedRoute>
          } />
          <Route path="/more" element={
            <ProtectedRoute><Layout bare><MorePage /></Layout></ProtectedRoute>
          } />
          <Route path="/my-seat" element={
            <ProtectedRoute><Layout><MySeatPage /></Layout></ProtectedRoute>
          } />
          {/* 옛 링크 대비 — 대시보드는 홈으로 합쳐졌다 */}
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/verify" element={
            <ProtectedRoute><Layout><VerificationPage /></Layout></ProtectedRoute>
          } />
          <Route path="/report" element={
            <ProtectedRoute><Layout><ReportPage /></Layout></ProtectedRoute>
          } />
          {/* 자리 고르기는 단계마다 주소를 나눈다(학우실 → 방 → 배치도) — 뒤로 가기가
              단계 되돌리기가 되게. 한 Route로 받아서 단계를 옮겨도 자리 목록을
              다시 불러오지 않는다. */}
          <Route path="/seats/:gender?/:room?" element={
            <ProtectedRoute><Layout><SeatsPage /></Layout></ProtectedRoute>
          } />
          <Route path="/checkin/:rid" element={
            <ProtectedRoute><Layout><Suspense fallback={<PageFallback />}><CheckinPage /></Suspense></Layout></ProtectedRoute>
          } />

          <Route path="/admin" element={
            <AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute>
          } />
          {/* 부품 전시 화면 — 디자인 확인용 (관리자만) */}
          <Route path="/ui" element={
            <AdminRoute><Layout><UiKitPage /></Layout></AdminRoute>
          } />
          <Route path="/admin/qr-print" element={
            <AdminRoute><Layout><Suspense fallback={<PageFallback />}><QrPrintPage /></Suspense></Layout></AdminRoute>
          } />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
