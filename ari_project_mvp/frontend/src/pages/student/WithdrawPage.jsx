import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/index.js'
import {
  Button, Card, ConfirmDialog, Notice, PageTitle, PasswordField, TextField,
} from '../../components/ui/index.js'
import { IconBack } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { errMsg } from '../../utils/helpers.js'

const STUDENT_ID_LENGTH = 9

export default function WithdrawPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [studentId, setStudentId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const ready = password.length > 0 && studentId.length === STUDENT_ID_LENGTH

  const run = async () => {
    setBusy(true); setError('')
    try {
      await authApi.withdraw({ password, student_id: studentId })
      logout()
      navigate('/login', { state: { notice: '탈퇴가 완료되었어요.', tone: 'info' } })
    } catch (err) {
      // 진행 중 예약·이용 정지 같은 이유는 서버 문구를 그대로 보여준다
      setError(errMsg(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/more')}>
        <IconBack size={16} aria-hidden="true" /> 뒤로
      </Button>
      <PageTitle>회원 탈퇴</PageTitle>

      <Notice tone="warning" title="탈퇴하면 되돌릴 수 없어요">
        이름·학번·이메일이 바로 삭제되고, 예약·이용 기록도 함께 사라져요.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}

      <Card elevated>
        <form onSubmit={e => { e.preventDefault(); if (ready) setConfirming(true) }} noValidate>
          <PasswordField label="비밀번호" name="password" value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" required />
          <TextField label="학번" name="student_id" value={studentId}
            onChange={e => setStudentId(e.target.value.replace(/\D/g, '').slice(0, STUDENT_ID_LENGTH))}
            placeholder={user?.student_id || '202100001'} hint="본인 확인을 위해 학번을 한 번 더 입력하세요"
            inputMode="numeric" autoComplete="off" required />
          <Button type="submit" variant="danger" block disabled={!ready}>탈퇴하기</Button>
        </form>
      </Card>

      {confirming && (
        <ConfirmDialog
          title="정말 탈퇴할까요?"
          description={'계정과 모든 기록이 바로 삭제되고 되돌릴 수 없어요.'}
          confirmLabel="탈퇴하기"
          tone="danger"
          busy={busy}
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
