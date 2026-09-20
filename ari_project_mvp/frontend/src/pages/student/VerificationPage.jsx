import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verificationApi } from '../../api/index.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { shrinkImage } from '../../utils/image.js'
import { errMsg, fmtDatetime, statusBadgeClass, statusLabel } from '../../utils/helpers.js'

// 관리자 검토 목표 시간(시간 단위). 안내 문구에만 쓰인다.
const REVIEW_HOURS = 24

function PrivacyNotice() {
  const [open, setOpen] = useState(false)
  return (
    <div className="consent-notice">
      <button type="button" className="consent-toggle" onClick={() => setOpen(o => !o)}
        aria-expanded={open}>
        개인정보 수집·이용 안내 {open ? '접기 ▲' : '자세히 보기 ▼'}
      </button>
      {open && (
        <dl className="consent-detail">
          <dt>수집 항목</dt>
          <dd>제출한 화면 캡처 (이름, 학번, 학과, 재학 상태)</dd>
          <dt>이용 목적</dt>
          <dd>재학생 확인 후 좌석 예약 권한 부여</dd>
          <dt>보관 기간</dt>
          <dd>관리자가 승인 또는 거절하는 즉시 이미지를 삭제합니다. 처리 결과 기록만 남습니다.</dd>
          <dt>동의 거부</dt>
          <dd>동의를 거부할 수 있으나, 거부하면 좌석 예약을 이용할 수 없습니다.</dd>
        </dl>
      )}
    </div>
  )
}

function HowTo() {
  return (
    <div className="card">
      <div className="card-title">이런 화면을 올려주세요</div>
      <ol className="howto-list">
        <li>
          <strong>헤이영캠퍼스 모바일 학생증 화면</strong> <span className="howto-tag">권장</span>
          <div className="text-muted">QR 부분은 가리고 올려도 됩니다.</div>
        </li>
        <li>
          <strong>학교 포털 &gt; 학적정보 화면</strong>
          <div className="text-muted">이름, 학번, 학과, 재학 상태가 함께 보이게 캡처해주세요.</div>
        </li>
      </ol>
      <ul className="howto-notes">
        <li>이름과 학번이 가입 정보와 같아야 승인됩니다.</li>
        <li>장학금·성적 등 다른 정보가 보이면 가려서 올려주세요.</li>
        <li>포털 <strong>메인페이지 전체 캡처</strong>는 학번이 보이지 않고 불필요한 정보가 많아 권하지 않습니다.</li>
      </ul>
    </div>
  )
}

export default function VerificationPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [resubmit, setResubmit] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef()

  const load = async () => {
    try {
      const r = await verificationApi.myStatus()
      setRecords(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }

  // 관리자가 방금 승인했을 수 있으므로 진입할 때 내 계정 상태를 다시 받아온다
  useEffect(() => { refreshUser?.().catch(() => {}); load() }, [])

  // 미리보기 blob URL 정리
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const pickFile = (e) => {
    const f = e.target.files?.[0] || null
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : '')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!file) { setError('올릴 화면 캡처를 선택해주세요'); return }
    if (!agreed) { setError('개인정보 수집·이용에 동의해야 제출할 수 있습니다'); return }
    setError(''); setMsg(''); setUploading(true)
    try {
      const payload = await shrinkImage(file)
      await verificationApi.submit(payload)
      setMsg('제출되었습니다. 관리자 확인 후 결과를 알려드립니다.')
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(null); setPreviewUrl(''); setAgreed(false); setResubmit(false)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err) {
      setError(errMsg(err))
    } finally { setUploading(false) }
  }

  const latest = records[0] || null
  const pending = records.some(r => r.status === 'pending')
  const verified = !!user?.is_verified
  const rejected = !verified && !pending && latest?.status === 'rejected'
  const showForm = !verified && !pending && (!rejected || resubmit)

  return (
    <div>
      <h1 className="page-title">학생 인증</h1>

      {/* 상태 안내 */}
      {verified ? (
        <div className="verify-status verify-status--ok">
          <strong>인증 완료! 이제 좌석을 예약할 수 있어요</strong>
          <button className="btn btn-primary btn-block mt-4" onClick={() => navigate('/seats')}>
            좌석 예약하러 가기
          </button>
        </div>
      ) : pending ? (
        <div className="verify-status verify-status--wait">
          <strong>관리자가 확인 중이에요</strong>
          <p>보통 {REVIEW_HOURS}시간 이내에 처리됩니다.</p>
        </div>
      ) : rejected ? (
        <div className="verify-status verify-status--no">
          <strong>인증이 거절되었어요</strong>
          <p className="verify-reason">사유: {latest?.admin_note || '사유가 기록되지 않았습니다'}</p>
          {!resubmit && (
            <button className="btn btn-primary btn-block mt-4" onClick={() => setResubmit(true)}>
              다시 제출하기
            </button>
          )}
        </div>
      ) : (
        <div className="verify-status verify-status--new">
          <strong>화면을 올리면 관리자 확인 후 예약할 수 있어요</strong>
        </div>
      )}

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <>
          {/* 무엇과 대조되는지 알 수 있게 가입 정보를 먼저 보여준다 */}
          <div className="card signup-info">
            <div className="card-title">내 가입 정보 — 이 내용과 같아야 승인돼요</div>
            <div className="signup-info-row"><span>이름</span><strong>{user?.name || '—'}</strong></div>
            <div className="signup-info-row">
              <span>학번</span><strong className="mono-id">{user?.student_id || '—'}</strong>
            </div>
          </div>

          <HowTo />

          <div className="card">
            <div className="card-title">화면 캡처 올리기</div>
            <form onSubmit={submit}>
              <div className="form-group">
                <input className="form-input" type="file" ref={fileRef}
                  accept="image/*,.pdf" onChange={pickFile} />
                <div className="form-hint">
                  사진을 찍거나 갤러리에서 고를 수 있어요. 이미지 · PDF, 최대 10MB.
                </div>
              </div>

              {previewUrl && (
                <div className="upload-preview">
                  <img src={previewUrl} alt="올릴 화면 미리보기" />
                </div>
              )}
              {file && !previewUrl && (
                <div className="alert alert-info">선택한 파일: {file.name}</div>
              )}

              <PrivacyNotice />

              <label className="consent-check">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <span>개인정보 수집·이용에 동의합니다</span>
              </label>

              <button className="btn btn-primary btn-block" disabled={uploading || !agreed || !file}>
                {uploading ? <><span className="spinner" /> 올리는 중...</> : '제출하기'}
              </button>
            </form>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-title">제출 이력</div>
        {loading ? (
          <div className="loading-box"><span className="spinner" /></div>
        ) : records.length === 0 ? (
          <div className="text-muted">제출 이력이 없습니다.</div>
        ) : (
          <ul className="history-list">
            {records.map(r => (
              <li key={r.id} className="history-item">
                <div className="history-item-head">
                  <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                  <span className="text-muted">{fmtDatetime(r.created_at)}</span>
                </div>
                {r.admin_note && <div className="history-item-note">{r.admin_note}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
