import React, { useEffect, useRef, useState } from 'react'
import { verificationApi } from '../../api/index.js'
import { fmtDatetime, statusLabel, statusBadgeClass } from '../../utils/helpers.js'

export default function VerificationPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef()

  const load = async () => {
    try {
      const r = await verificationApi.myStatus()
      setRecords(r.data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    const file = fileRef.current?.files[0]
    if (!file) { setError('파일을 선택해주세요'); return }
    setError(''); setMsg(''); setUploading(true)
    try {
      await verificationApi.submit(file)
      setMsg('인증자료가 제출되었습니다. 관리자 검토 후 결과를 알려드립니다.')
      fileRef.current.value = ''
      load()
    } catch (err) {
      setError(err.response?.data?.detail || '업로드에 실패했습니다')
    } finally { setUploading(false) }
  }

  const latestPending = records.find(r => r.status === 'pending')
  const canSubmit = !latestPending

  return (
    <div>
      <h1 className="page-title">학생 인증</h1>

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <strong>인증 방법:</strong> 학생증 사진 또는 학교 포털(학생증 정보 화면) 캡처를 업로드하세요.
        관리자가 확인 후 승인하면 좌석 예약이 가능해집니다.
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {canSubmit && (
        <div className="card">
          <div className="card-title">인증자료 제출</div>
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">파일 선택 (JPG, PNG, PDF, WEBP — 최대 10MB)</label>
              <input className="form-input" type="file" ref={fileRef}
                accept=".jpg,.jpeg,.png,.pdf,.webp" />
              <div className="form-hint">
                파일명에 이름_학번 형식을 포함하면 Mock OCR 인식률이 높아집니다. 예: 홍길동_20210001.jpg
              </div>
            </div>
            <button className="btn btn-primary" disabled={uploading}>
              {uploading ? <><span className="spinner" /> 업로드 중...</> : '제출하기'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">제출 이력</div>
        {loading ? (
          <div className="loading-box"><span className="spinner" /></div>
        ) : records.length === 0 ? (
          <div className="text-muted">제출 이력이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>제출일</th><th>상태</th><th>관리자 메모</th></tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDatetime(r.created_at)}</td>
                    <td><span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                    <td>{r.admin_note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {latestPending && (
          <div className="alert alert-warning mt-4">
            검토 중인 인증 요청이 있습니다. 관리자 승인을 기다려주세요.
          </div>
        )}
      </div>
    </div>
  )
}
