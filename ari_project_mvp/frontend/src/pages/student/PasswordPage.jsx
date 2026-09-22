import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/index.js'
import {
  Button, Card, Notice, PageTitle, PasswordChecklist, PasswordField, passwordOk,
} from '../../components/ui/index.js'
import { IconBack } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { errMsg } from '../../utils/helpers.js'

export default function PasswordPage() {
  const navigate = useNavigate()
  const { user, setSession } = useAuth()
  const [params] = useSearchParams()
  // 임시 비밀번호로 들어온 상태 — 바꾸기 전에는 빠져나갈 길을 주지 않는다
  const required = params.get('required') === '1'

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== next
  const same = next.length > 0 && next === current
  const ready =
    current.length > 0 && passwordOk(next, user?.student_id) && confirm === next && !same

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || loading) return
    setError(''); setLoading(true)
    try {
      const r = await authApi.changePassword({ current_password: current, new_password: next })
      // 바꾸는 순간 옛 토큰이 무효가 되므로 응답으로 온 새 토큰으로 갈아끼운다
      setSession(r.data.access_token, r.data.user)
      navigate('/home', {
        state: { notice: '비밀번호를 바꿨어요. 다른 기기에서는 로그아웃되었어요.' },
      })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {!required && (
        <Button variant="ghost" size="sm" onClick={() => navigate('/more')}>
          <IconBack size={16} aria-hidden="true" /> 뒤로
        </Button>
      )}
      <PageTitle>비밀번호 변경</PageTitle>

      {required && (
        <Notice tone="warning" title="임시 비밀번호로 로그인했어요">
          새 비밀번호로 바꿔야 계속 이용할 수 있어요.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card elevated>
        <form onSubmit={submit} noValidate>
          <PasswordField label="현재 비밀번호" name="current_password" value={current}
            onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />

          <PasswordField label="새 비밀번호" name="new_password" value={next}
            onChange={e => setNext(e.target.value)} autoComplete="new-password" required
            error={same ? '지금 쓰는 비밀번호와 다른 것으로 바꿔 주세요' : undefined} />
          <PasswordChecklist password={next} studentId={user?.student_id} />

          <PasswordField label="새 비밀번호 확인" name="new_password_confirm" value={confirm}
            onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required
            error={mismatch ? '비밀번호가 서로 달라요' : undefined} />

          <Button type="submit" block loading={loading} disabled={!ready}>
            {loading ? '바꾸는 중...' : '비밀번호 바꾸기'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
