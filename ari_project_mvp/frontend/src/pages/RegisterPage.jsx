import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/index.js'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', name: '', student_id: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다'); return }
    setLoading(true)
    try {
      await authApi.register(form)
      navigate('/login', { state: { message: '회원가입이 완료되었습니다. 로그인해주세요.' } })
    } catch (err) {
      setError(err.response?.data?.detail || '회원가입에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-title">회원가입</div>
        <div className="auth-sub">아리쉼표 계정을 만들어보세요</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input className="form-input" name="name" value={form.name} onChange={handle} placeholder="홍길동" required />
          </div>
          <div className="form-group">
            <label className="form-label">학번</label>
            <input className="form-input" name="student_id" value={form.student_id} onChange={handle} placeholder="20210001" required />
          </div>
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input className="form-input" type="email" name="email" value={form.email} onChange={handle} placeholder="example@anyang.ac.kr" required />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input className="form-input" type="password" name="password" value={form.password} onChange={handle} placeholder="6자 이상" required />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner" /> 처리 중...</> : '회원가입'}
          </button>
        </form>
        <div className="text-center mt-4 text-muted">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </div>
      </div>
    </div>
  )
}
