import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { operationApi, reservationApi } from '../../api/index.js'
import PenaltyNotice from '../../components/PenaltyNotice.jsx'
import {
  Button, Card, ConfirmDialog, EmptyState, LoadingBox,
  Notice, PageTitle, StatusBadge,
} from '../../components/ui/index.js'
import { IconGo, IconQr } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fmtDatetime, fmtTime, parseUTC } from '../../utils/helpers.js'

// usage_ends_at 도입 전에 체크인된 예약을 위한 예전 계산 (백엔드 max_usage_seconds=7200)
const MAX_USAGE_MS = 2 * 60 * 60 * 1000
const HISTORY_LIMIT = 10

/** 이용 종료 예정 시각 — 서버가 확정한 값이 있으면 그 값, 없으면 예전 방식 */
function usageEndIso(r) {
  if (r?.usage_ends_at) return r.usage_ends_at
  if (r?.checked_in_at) return new Date(parseUTC(r.checked_in_at).getTime() + MAX_USAGE_MS).toISOString()
  return null
}

function StatusCell({ label, children }) {
  return (
    <div className="status-card">
      <div className="label">{label}</div>
      <div className="value">{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [op, setOp] = useState(null)
  const [cancelling, setCancelling] = useState(false)   // 예약 취소 확인창

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
    operationApi.get().then(r => setOp(r.data)).catch(() => {})
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
    if (!active) return
    setCancelling(false)
    try {
      await reservationApi.cancel(active.id)
      setActionMsg('예약이 취소되었습니다.')
      load()
    } catch (e) {
      setActionError(e.response?.data?.detail || '취소에 실패했습니다')
    }
  }

  return (
    <div>
      <PageTitle>대시보드</PageTitle>

      <PenaltyNotice />

      {actionMsg && <Notice tone="success">{actionMsg}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}

      {/* 인증 상태 */}
      {user?.is_verified ? (
        <Notice tone="success" title="학생 인증 완료" />
      ) : (
        <Notice
          tone="warning"
          title="학생 인증이 필요해요"
          action={<Link to="/verify" className="ui-btn ui-btn--secondary ui-btn--sm">
            인증 제출하기 <IconGo size={16} aria-hidden="true" />
          </Link>}
        >
          학생증 또는 포털 화면을 업로드하세요.
        </Notice>
      )}

      {user?.is_suspended && (
        <Notice tone="danger" title="계정이 정지 상태입니다">
          {user?.suspended_until && <>해제 예정: {fmtDatetime(user.suspended_until)}</>}
        </Notice>
      )}

      {/* 현재 예약 — 이 화면의 주인공 카드 */}
      <Card elevated title="현재 예약">
        {loading ? (
          <LoadingBox />
        ) : active ? (
          <div>
            <div className="status-row">
              <StatusCell label="좌석">{active.seat_number || '—'}</StatusCell>
              <StatusCell label="상태"><StatusBadge status={active.status} /></StatusCell>
              {active.status === 'pending' && (
                <StatusCell label="체크인 마감">
                  <span className="status-card-time">{fmtDatetime(active.expires_at)}</span>
                </StatusCell>
              )}
              {active.status === 'checked_in' && (
                <StatusCell label="이용 종료 예정">
                  <span className="status-card-time">{fmtTime(usageEndIso(active))}</span>
                </StatusCell>
              )}
            </div>

            {active.status === 'pending' && op?.usage_ends_at_if_checkin_now && (
              <p className="usage-end-line">
                지금 체크인하면 <strong>{fmtTime(op.usage_ends_at_if_checkin_now)}</strong>까지 이용할 수 있어요
              </p>
            )}

            <div className="flex gap-2 mt-2">
              {active.status === 'pending' && (
                <>
                  <Button onClick={handleCheckin}>
                    <IconQr size={18} aria-hidden="true" /> QR 체크인
                  </Button>
                  <Button variant="secondary" onClick={() => setCancelling(true)}>예약 취소</Button>
                </>
              )}
              {active.status === 'checked_in' && (
                <Button variant="danger" onClick={handleCheckout}>퇴실하기</Button>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="현재 활성 예약이 없습니다."
            action={user?.is_verified && !user?.is_suspended && (
              <Link to="/seats" className="ui-btn ui-btn--primary">좌석 예약하기</Link>
            )}
          />
        )}
      </Card>

      {/* 최근 이용 이력 */}
      <Card title="최근 이용 이력">
        {reservations.length === 0 ? (
          <EmptyState title="이용 내역이 없습니다." compact />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>좌석</th><th>예약 시간</th><th>상태</th></tr>
              </thead>
              <tbody>
                {reservations.slice(0, HISTORY_LIMIT).map(r => (
                  <tr key={r.id}>
                    <td>{r.seat_number || r.seat_id.slice(0, 8)}</td>
                    <td>{fmtDatetime(r.reserved_at)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {cancelling && (
        <ConfirmDialog
          title="예약을 취소할까요?"
          description={`${active?.seat_number || ''} 좌석 예약이 취소됩니다. 다시 예약하려면 좌석 화면에서 새로 골라야 해요.`}
          confirmLabel="예약 취소"
          tone="danger"
          onConfirm={handleCancel}
          onCancel={() => setCancelling(false)}
        />
      )}
    </div>
  )
}
