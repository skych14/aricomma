import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { Button, Notice, PasswordField, TextField } from '../components/ui/index.js'
import { useAuth } from '../contexts/AuthContext.jsx'

// 잠금(423)·IP 제한(429)은 "틀렸다"가 아니라 "잠시 기다려 달라"는 안내다
const WAIT_STATUSES = [423, 429]

// api/client.js가 토큰이 끊겼을 때 남겨두는 안내
const NOTICE_KEY = 'ari_login_notice'
/* 지우기까지 두는 시간. 토큰이 끊기면 앱이 먼저 라우터로 /login에 들렀다가
   인터셉터의 전체 새로고침이 뒤따르는데, 읽자마자 지우면 그 사이에 안내가
   사라진다. 잠깐 남겨 두면 다시 뜬 화면에서도 한 번은 읽힌다. */
const NOTICE_TTL_MS = 3000

function readStoredNotice() {
  try {
    return sessionStorage.getItem(NOTICE_KEY) || ''
  } catch {
    return ''
  }
}

function dropStoredNotice() {
  try { sessionStorage.removeItem(NOTICE_KEY) } catch { /* 이미 못 쓰는 상태 */ }
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  // 가입 직후·세션 만료 후 넘어온 값
  const [form, setForm] = useState({ email: state?.email || '', password: '' })
  const [stored] = useState(readStoredNotice)
  const [notice, setNotice] = useState(state?.notice || stored)
  // 끊긴 세션 안내는 경고, 가입·탈퇴 완료 같은 알림은 그대로
  const noticeTone = state?.tone || (stored ? 'warning' : 'info')
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)   // 잠금·제한 안내인지
  const [loading, setLoading] = useState(false)

  // 안내를 잠깐 남겨 두었다가 지운다 (위 NOTICE_TTL_MS 설명)
  useEffect(() => {
    if (!stored) return
    const t = setTimeout(dropStoredNotice, NOTICE_TTL_MS)
    return () => clearTimeout(t)
  }, [stored])

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    dropStoredNotice()
    setError(''); setNotice(''); setLoading(true)
    try {
      const user = await login(form.email.trim().toLowerCase(), form.password)
      // 임시 비밀번호로 들어왔으면 바꾸기 전까지 다른 화면을 쓸 수 없다
      if (user.must_change_password) { navigate('/password?required=1'); return }
      navigate(user.role === 'admin' ? '/admin' : '/home')
    } catch (err) {
      setWaiting(WAIT_STATUSES.includes(err.response?.status))
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

        {notice && <Notice tone={noticeTone}>{notice}</Notice>}
        {error && <Notice tone={waiting ? 'warning' : 'danger'}>{error}</Notice>}

        <form onSubmit={submit}>
          <TextField label="이메일" type="email" name="email" value={form.email}
            onChange={handle} placeholder="example@anyang.ac.kr"
            autoComplete="email" required />
          <PasswordField label="비밀번호" name="password" value={form.password}
            onChange={handle} placeholder="비밀번호"
            autoComplete="current-password" required />
          <Button type="submit" block loading={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <p className="text-center mt-2 text-muted">
          비밀번호를 잊으셨나요? 관리자에게 임시 비밀번호를 요청하세요.
        </p>
        <div className="text-center mt-4 text-muted">
          계정이 없으신가요? <Link to="/register">회원가입</Link>
        </div>
      </div>
    </div>
  )
}
