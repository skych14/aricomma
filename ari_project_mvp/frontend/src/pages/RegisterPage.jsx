import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/index.js'
import { Button, Notice, PageTitle, TextField } from '../components/ui/index.js'

const PASSWORD_MIN = 6

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', name: '', student_id: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < PASSWORD_MIN) {
      setError(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다`); return
    }
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
        <div className="text-center"><PageTitle>회원가입</PageTitle></div>
        <div className="auth-sub">아리쉼표 계정을 만들어보세요</div>
        {error && <Notice tone="danger">{error}</Notice>}
        <form onSubmit={submit}>
          <TextField label="이름" name="name" value={form.name} onChange={handle}
            placeholder="홍길동" required />
          <TextField label="학번" name="student_id" value={form.student_id} onChange={handle}
            placeholder="20210001" required />
          <TextField label="이메일" type="email" name="email" value={form.email} onChange={handle}
            placeholder="example@anyang.ac.kr" required />
          <TextField label="비밀번호" type="password" name="password" value={form.password}
            onChange={handle} placeholder={`${PASSWORD_MIN}자 이상`} required />
          <Button type="submit" block loading={loading}>
            {loading ? '처리 중...' : '회원가입'}
          </Button>
        </form>
        <div className="text-center mt-4 text-muted">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </div>
      </div>
    </div>
  )
}
