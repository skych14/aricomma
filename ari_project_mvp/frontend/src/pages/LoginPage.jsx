import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { Button, Notice, TextField } from '../components/ui/index.js'
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
      navigate(user.role === 'admin' ? '/admin' : '/home')
    } catch (err) {
      setError(err.response?.data?.detail || '로그인에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo"><Logo variant="mark" size={72} wordmark /></div>
        <div className="auth-sub">안양대학교 학우실 예약 서비스</div>
        {error && <Notice tone="danger">{error}</Notice>}
        <form onSubmit={submit}>
          <TextField label="이메일" type="email" name="email" value={form.email}
            onChange={handle} placeholder="example@anyang.ac.kr" required />
          <TextField label="비밀번호" type="password" name="password" value={form.password}
            onChange={handle} placeholder="비밀번호" required />
          <Button type="submit" block loading={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>
        <div className="text-center mt-4 text-muted">
          계정이 없으신가요? <Link to="/register">회원가입</Link>
        </div>
      </div>
    </div>
  )
}
