import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      navigate(user.role === 'admin' ? '/admin' : '/seats')
    } catch (err) {
      setError(err.response?.data?.detail || '로그인에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-title">🛏️ 아리쉼표</div>
        <div className="auth-sub">안양대학교 학우실 예약 서비스</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input className="form-input" type="email" name="email" value={form.email}
              onChange={handle} placeholder="example@anyang.ac.kr" required />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input className="form-input" type="password" name="password" value={form.password}
              onChange={handle} placeholder="비밀번호" required />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner" /> 로그인 중...</> : '로그인'}
          </button>
        </form>
        <div className="text-center mt-4 text-muted">
          계정이 없으신가요? <Link to="/register">회원가입</Link>
        </div>

      </div>
    </div>
  )
}
