import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { reservationApi } from '../../api/index.js'
import { fmtDatetime, parseUTC } from '../../utils/helpers.js'

function Countdown({ expiresAt }) {
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((parseUTC(expiresAt) - Date.now()) / 1000))
      setSecs(diff)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  const min = String(Math.floor(secs / 60)).padStart(2, '0')
  const sec = String(secs % 60).padStart(2, '0')
  return <div className={`timer ${secs > 60 ? 'ok' : ''}`}>{min}:{sec}</div>
}

export default function CheckinPage() {
  const { rid } = useParams()
  const navigate = useNavigate()
  const [reservation, setReservation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qrToken, setQrToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    reservationApi.myList()
      .then(r => {
        const found = r.data.find(x => x.id === rid)
        setReservation(found || null)
      })
      .catch(() => setReservation(null))
      .finally(() => { setLoading(false); setTimeout(() => inputRef.current?.focus(), 100) })
  }, [rid])

  const submit = async (e) => {
    e.preventDefault()
    if (!qrToken.trim()) { setError('QR 토큰을 입력해주세요'); return }
    setError(''); setSubmitting(true)
    try {
      await reservationApi.checkin(rid, qrToken.trim())
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      setError(err.response?.data?.detail || '체크인에 실패했습니다')
      if (err.response?.status === 410) {
        setTimeout(() => navigate('/seats'), 3000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="loading-box"><span className="spinner" /></div>

  if (!reservation) return (
    <div className="card">
      <div className="alert alert-error">예약을 찾을 수 없습니다.</div>
      <button className="btn btn-outline mt-4" onClick={() => navigate('/dashboard')}>대시보드로</button>
    </div>
  )

  if (reservation.status === 'checked_in') return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem' }}>✅</div>
      <h2 style={{ margin: '12px 0' }}>이미 체크인된 예약입니다</h2>
      <p className="text-muted">좌석 {reservation.seat_number} 이용 중</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/dashboard')}>대시보드로</button>
    </div>
  )

  if (['expired', 'cancelled', 'completed'].includes(reservation.status)) return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem' }}>⏰</div>
      <h2 style={{ margin: '12px 0' }}>유효하지 않은 예약입니다</h2>
      <p className="text-muted">다시 예약해주세요.</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/seats')}>좌석 예약하기</button>
    </div>
  )

  if (success) return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
      <h2>체크인 완료!</h2>
      <p className="text-muted mt-2">좌석 {reservation.seat_number} 이용이 시작되었습니다.</p>
      <p className="text-muted">잠시 후 대시보드로 이동합니다...</p>
    </div>
  )

  return (
    <div>
      <h1 className="page-title">QR 체크인</h1>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div>
            <div className="section-title">예약 좌석: {reservation.seat_number || '—'}</div>
            <div className="text-muted">{reservation.location} · 침대</div>
          </div>
          <div className="text-center">
            <div className="text-muted" style={{ fontSize: '.82rem' }}>체크인 마감</div>
            <Countdown expiresAt={reservation.expires_at} />
          </div>
        </div>

        <div className="qr-box">
          <div className="qr-icon">📱</div>
          <p>
            <strong>현장 침대에 부착된 QR을 스캔하세요</strong>
          </p>
          {error && <div className="alert alert-error" style={{ textAlign: 'left' }}>{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <input
                ref={inputRef}
                className="form-input"
                value={qrToken}
                onChange={e => setQrToken(e.target.value)}
                placeholder="좌석에 부착된 QR 토큰 입력 (예: uuid 형식)"
                style={{ fontFamily: 'monospace', fontSize: '.85rem' }}
              />
              <div className="form-hint">
                카메라로 QR 스캔 시 자동 입력됩니다.
              </div>
            </div>
            <button className="btn btn-success btn-block" disabled={submitting}>
              {submitting ? <><span className="spinner" /> 체크인 중...</> : '체크인'}
            </button>
          </form>
        </div>

        <button className="btn btn-ghost btn-sm mt-4" onClick={() => navigate('/dashboard')}>
          ← 대시보드로
        </button>
      </div>
    </div>
  )
}
