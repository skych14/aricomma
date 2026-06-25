import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import CheckinPage from './pages/student/CheckinPage.jsx'
import DashboardPage from './pages/student/DashboardPage.jsx'
import SeatsPage from './pages/student/SeatsPage.jsx'
import VerificationPage from './pages/student/VerificationPage.jsx'

function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/seats" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/dashboard" element={
            <ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>
          } />
          <Route path="/verify" element={
            <ProtectedRoute><Layout><VerificationPage /></Layout></ProtectedRoute>
          } />
          <Route path="/seats" element={
            <ProtectedRoute><Layout><SeatsPage /></Layout></ProtectedRoute>
          } />
          <Route path="/checkin/:rid" element={
            <ProtectedRoute><Layout><CheckinPage /></Layout></ProtectedRoute>
          } />

          <Route path="/admin" element={
            <AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute>
          } />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
