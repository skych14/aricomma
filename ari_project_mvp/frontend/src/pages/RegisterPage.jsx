import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/index.js'
import {
  Button, Modal, Notice, PageTitle, PasswordChecklist, PasswordField,
  passwordOk, TextField,
} from '../components/ui/index.js'
import { IconExpand, IconCollapse } from '../components/ui/icons.jsx'
import { errMsg } from '../utils/helpers.js'

const STUDENT_ID_LENGTH = 9
// 앞 4자리는 입학년도(숫자), 뒤 5자리는 숫자 또는 영문 대문자 — 백엔드와 같은 규칙
// (backend/schemas/user.py STUDENT_ID_RE)
const STUDENT_ID_RE = /^\d{4}[0-9A-Z]{5}$/
const STUDENT_ID_ERROR = '학번은 9자리(숫자, 영문)로 입력하세요'
const NAME_MIN = 2

// 백엔드가 privacy_agreed_at에 남기는 동의의 실제 내용 (backend/routers/auth.py)
function PrivacyDetail() {
  return (
    <dl className="privacy-detail">
      <dt>수집 항목</dt>
      <dd>이름, 학번, 이메일</dd>
      <dt>이용 목적</dt>
      <dd>학우실 이용자 확인, 자리 예약·이용 관리, 민원 처리</dd>
      <dt>보관 기간</dt>
      <dd>회원 탈퇴 시까지 (탈퇴 즉시 삭제)</dd>
      <dd className="privacy-detail-note">
        동의하지 않을 수 있으며, 동의하지 않으면 가입할 수 없습니다.
      </dd>
    </dl>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', student_id: '', email: '', password: '' })
  const [confirm, setConfirm] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  // 학번은 숫자·영문 9자리 — 소문자는 대문자로 올리고 나머지 글자는 털어낸 뒤 9자리에서 자른다.
  // maxLength를 걸지 않는 이유: 브라우저가 먼저 잘라버리면 "학번 2021E7312"를
  // 붙여넣었을 때 앞의 글자까지 9자에 포함돼 뒷자리가 사라진다.
  const handleStudentId = (e) =>
    setForm({
      ...form,
      student_id: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, STUDENT_ID_LENGTH),
    })

  const mismatch = confirm.length > 0 && confirm !== form.password
  const studentIdOk = STUDENT_ID_RE.test(form.student_id)
  // 다 치기 전부터 잔소리하지 않도록, 9자리를 채웠는데도 규칙에 안 맞을 때만 알린다
  const studentIdError =
    form.student_id.length >= STUDENT_ID_LENGTH && !studentIdOk ? STUDENT_ID_ERROR : ''
  const ready =
    form.name.trim().length >= NAME_MIN &&
    studentIdOk &&
    form.email.trim().length > 0 &&
    passwordOk(form.password, form.student_id) &&
    confirm === form.password &&
    agreed

  const toLogin = () => navigate('/login', { state: { email: form.email.trim().toLowerCase() } })

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || loading) return
    setError(''); setLoading(true)
    try {
      await authApi.register({
        name: form.name.trim(),
        student_id: form.student_id,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        privacy_agreed: true,
      })
      setDone(true)
    } catch (err) {
      setError(errMsg(err))
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

        <form onSubmit={submit} noValidate>
          <TextField label="이름" name="name" value={form.name} onChange={handle}
            placeholder="홍길동" autoComplete="name" required />

          <TextField label="학번" name="student_id" value={form.student_id}
            onChange={handleStudentId} placeholder="202112345"
            hint="예: 202112345 또는 2021E7312" error={studentIdError}
            autoCapitalize="characters" autoComplete="off" required />

          <TextField label="이메일" type="email" name="email" value={form.email}
            onChange={handle} placeholder="example@anyang.ac.kr"
            autoComplete="email" required />

          <PasswordField label="비밀번호" name="password" value={form.password}
            onChange={handle} placeholder="비밀번호" autoComplete="new-password" required />
          <PasswordChecklist password={form.password} studentId={form.student_id} />

          <PasswordField label="비밀번호 확인" name="password_confirm" value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="한 번 더 입력"
            autoComplete="new-password" required
            error={mismatch ? '비밀번호가 서로 달라요' : undefined} />

          <div className="privacy-agree">
            <label className="privacy-agree-line">
              <input type="checkbox" checked={agreed}
                onChange={e => setAgreed(e.target.checked)} />
              개인정보 수집·이용에 동의합니다 (필수)
            </label>
            <Button variant="ghost" size="sm" aria-expanded={showPrivacy}
              onClick={() => setShowPrivacy(v => !v)}>
              내용 보기
              {showPrivacy
                ? <IconCollapse size={16} aria-hidden="true" />
                : <IconExpand size={16} aria-hidden="true" />}
            </Button>
            {showPrivacy && <PrivacyDetail />}
          </div>

          <Button type="submit" block loading={loading} disabled={!ready}>
            {loading ? '처리 중...' : '가입하기'}
          </Button>
        </form>

        <div className="text-center mt-4 text-muted">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </div>
      </div>

      {done && (
        // 바깥을 누르거나 Esc로 닫아도 할 일은 같다 — 로그인 화면으로 보낸다
        <Modal title="가입이 완료되었어요" onClose={toLogin}>
          <p className="ui-modal-desc">
            로그인한 뒤 학생 인증을 하면 자리를 예약할 수 있어요.
          </p>
          <div className="ui-modal-actions">
            <Button block onClick={toLogin}>로그인하러 가기</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
