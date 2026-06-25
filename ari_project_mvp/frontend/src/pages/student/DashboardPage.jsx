import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { reservationApi } from '../../api/index.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fmtDatetime, parseUTC, statusLabel, statusBadgeClass } from '../../utils/helpers.js'

const MAX_USAGE_MS = 2 * 60 * 60 * 1000  // 백엔드 max_usage_seconds=7200 과 동기화

export default function DashboardPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [actionError, setActionError] = useState('')

  const load = async () => {
    try {
      const r = await reservationApi.myList()
      setReservations(r.data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    refreshUser().catch(() => {})
    load()
  }, [])

  const active = reservations.find(r => ['pending', 'checked_in'].includes(r.status))

  const handleCheckin = () => {
    if (active) navigate(`/checkin/${active.id}`)
  }

  const handleCheckout = async () => {
    if (!active) return
    try {
      await reservationApi.checkout(active.id)
      setActionMsg('퇴실이 완료되었습니다.')
      load()
    } catch (e) {
      setActionError(e.response?.data?.detail || '퇴실에 실패했습니다')
    }
  }

  const handleCancel = async () => {
    if (!active || !confirm('예약을 취소하시겠습니까?')) return
    try {
      await reservationApi.cancel(active.id)
      setActionMsg('예약이 취소되었습니다.')
      load()
    } catch (e) {
      setActionError(e.response?.data?.detail || '취소에 실패했습니다')
    }
  }

  const verificationStatusLabel = () => {
    if (user?.is_verified) return { text: '인증 완료', cls: 'alert-success' }
    return { text: '인증 필요 — 학생증 또는 포털 화면을 업로드하세요', cls: 'alert-warning' }
  }
  const vs = verificationStatusLabel()

  return (
    <div>
      <h1 className="page-title">대시보드</h1>

      {actionMsg && <div className="alert alert-success">{actionMsg}</div>}
      {actionError && <div className="alert alert-error">{actionError}</div>}

      {/* 인증 상태 */}
      <div className={`alert ${vs.cls}`}>
        <strong>학생 인증 상태:</strong> {vs.text}
        {!user?.is_verified && (
          <> &nbsp;<Link to="/verify">인증 제출하기 →</Link></>
        )}
      </div>

      {user?.is_suspended && (
        <div className="alert alert-error">계정이 정지 상태입니다. 관리자에게 문의하세요.</div>
      )}

      {/* 현재 예약 카드 */}
      <div className="card">
        <div className="card-title">현재 예약</div>
        {loading ? (
          <div className="loading-box"><span className="spinner" /></div>
        ) : active ? (
          <div>
            <div className="status-row">
              <div className="status-card">
                <div className="label">좌석</div>
                <div className="value">{active.seat_number || '—'}</div>
              </div>
              <div className="status-card">
                <div className="label">상태</div>
                <div className="value">
                  <span className={`badge ${statusBadgeClass(active.status)}`}>
                    {statusLabel(active.status)}
                  </span>
                </div>
              </div>
              {active.status === 'pending' && (
                <div className="status-card">
                  <div className="label">체크인 마감</div>
                  <div className="value" style={{ fontSize: '1rem' }}>
                    {fmtDatetime(active.expires_at)}
                  </div>
                </div>
              )}
              {active.status === 'checked_in' && active.checked_in_at && (
                <div className="status-card">
                  <div className="label">자동 퇴실</div>
                  <div className="value" style={{ fontSize: '1rem' }}>
                    {fmtDatetime(new Date(parseUTC(active.checked_in_at).getTime() + MAX_USAGE_MS).toISOString())}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              {active.status === 'pending' && (
                <>
                  <button className="btn btn-success" onClick={handleCheckin}>QR 체크인</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleCancel}>예약 취소</button>
                </>
              )}
              {active.status === 'checked_in' && (
                <button className="btn btn-danger" onClick={handleCheckout}>퇴실하기</button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-muted">현재 활성 예약이 없습니다.</div>
            {user?.is_verified && !user?.is_suspended && (
              <Link to="/seats" className="btn btn-primary mt-2" style={{ marginTop: 12, display: 'inline-flex' }}>
                좌석 예약하기
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 최근 이용 이력 */}
      <div className="card">
        <div className="card-title">최근 이용 이력</div>
        {reservations.length === 0 ? (
          <div className="text-muted">이용 내역이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>좌석</th><th>예약 시간</th><th>상태</th></tr>
              </thead>
              <tbody>
                {reservations.slice(0, 10).map(r => (
                  <tr key={r.id}>
                    <td>{r.seat_number || r.seat_id.slice(0, 8)}</td>
                    <td>{fmtDatetime(r.reserved_at)}</td>
                    <td><span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
