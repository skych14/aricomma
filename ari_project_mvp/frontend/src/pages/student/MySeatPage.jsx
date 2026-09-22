import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reservationApi } from '../../api/index.js'
import {
  Button, Card, ConfirmDialog, EmptyState, LoadingBox,
  Notice, PageTitle, StatusBadge,
} from '../../components/ui/index.js'
import { IconBack, IconQr } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { errMsg, fmtDatetime, fmtTime, parseUTC } from '../../utils/helpers.js'

// usage_ends_at 도입 전에 체크인된 예약을 위한 예전 계산 (백엔드 max_usage_seconds)
const MAX_USAGE_MS = 2 * 60 * 60 * 1000
const HISTORY_LIMIT = 10

function usageEndIso(r) {
  if (r?.usage_ends_at) return r.usage_ends_at
  if (r?.checked_in_at) return new Date(parseUTC(r.checked_in_at).getTime() + MAX_USAGE_MS).toISOString()
  return null
}

/* 좌석번호는 "{침대조}-{층}" 규칙(backend/seed.py)이라 뒷자리가 층이다.
   /api/reservations/me는 층을 따로 내려주지 않아 번호에서 읽는다. */
function floorOf(seatNumber) {
  const n = Number(String(seatNumber || '').split('-')[1])
  return Number.isInteger(n) ? n : null
}

function StatusCell({ label, wide = false, children }) {
  return (
    <div className={`status-card${wide ? ' status-card--wide' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{children}</div>
    </div>
  )
}

export default function MySeatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')      // '' | 'cancel' | 'checkout'
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const r = await reservationApi.myList()
      setReservations(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const active = reservations.find(r => ['pending', 'checked_in'].includes(r.status))
  const isPending = active?.status === 'pending'

  // 끝나면 홈으로 돌아가며 완료 안내를 함께 넘긴다
  const finish = (notice) => navigate('/home', { state: { notice } })

  const run = async () => {
    if (!active) return
    setBusy(true); setError('')
    try {
      if (confirm === 'cancel') {
        await reservationApi.cancel(active.id)
        finish('예약이 취소되었습니다.')
      } else {
        await reservationApi.checkout(active.id)
        finish('퇴실 처리되었습니다.')
      }
    } catch (e) {
      setError(errMsg(e))
      setConfirm('')
      load()
    } finally { setBusy(false) }
  }

  const floor = floorOf(active?.seat_number)

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/home')}>
        <IconBack size={16} aria-hidden="true" /> 홈
      </Button>
      <PageTitle>내 좌석</PageTitle>

      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? (
        <LoadingBox />
      ) : active ? (
        <Card elevated>
          <div className="status-row">
            <StatusCell label="좌석">{active.seat_number || '—'}</StatusCell>
            <StatusCell label="상태"><StatusBadge status={active.status} /></StatusCell>
            {isPending ? (
              <StatusCell label="체크인 마감" wide>
                <span className="status-card-time">{fmtDatetime(active.expires_at)}</span>
              </StatusCell>
            ) : (
              <StatusCell label="이용 종료 예정" wide>
                <span className="status-card-time">{fmtTime(usageEndIso(active))}</span>
              </StatusCell>
            )}
          </div>

          <p className="text-muted">
            {active.location || '—'}{floor ? ` · ${floor}층` : ''}
          </p>

          <div className="flex gap-2 mt-4">
            {/* 정지 중에는 체크인을 서버가 403으로 막으므로 버튼을 내린다.
                자리를 비우는 예약 취소·퇴실은 정지 중에도 그대로 쓸 수 있다. */}
            {isPending && !user?.is_suspended && (
              <Button onClick={() => navigate(`/checkin/${active.id}`)}>
                <IconQr size={18} aria-hidden="true" /> QR 체크인
              </Button>
            )}
            <Button variant="danger" onClick={() => setConfirm(isPending ? 'cancel' : 'checkout')}>
              {isPending ? '예약 취소' : '퇴실'}
            </Button>
          </div>
        </Card>
      ) : (
        <Card elevated>
          <EmptyState
            title="이용 중인 좌석이 없어요"
            action={<Button onClick={() => navigate('/seats')}>좌석 예약하기</Button>}
          />
        </Card>
      )}

      <Card title="최근 이용 이력">
        {loading ? (
          <LoadingBox />
        ) : reservations.length === 0 ? (
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

      {confirm && (
        <ConfirmDialog
          title={confirm === 'cancel' ? '예약을 취소할까요?' : '퇴실할까요?'}
          description={confirm === 'cancel'
            ? `${active?.seat_number || ''} 좌석 예약이 취소되고, 다시 이용하려면 좌석 화면에서 새로 골라야 해요.`
            : `${active?.seat_number || ''} 좌석 이용이 끝나고 다른 학우가 바로 예약할 수 있게 됩니다.`}
          confirmLabel={confirm === 'cancel' ? '예약 취소' : '퇴실'}
          tone="danger"
          busy={busy}
          onConfirm={run}
          onCancel={() => setConfirm('')}
        />
      )}
    </div>
  )
}
