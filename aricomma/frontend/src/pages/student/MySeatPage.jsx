import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { operationApi, reservationApi } from '../../api/index.js'
import {
  Button, Card, ConfirmDialog, EmptyState, LoadingBox,
  Notice, PageTitle, StatusBadge,
} from '../../components/ui/index.js'
import { IconBack, IconQr, IconSeatMap } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { errMsg, fmtDatetime, fmtTime, inExtendWindow, parseUTC } from '../../utils/helpers.js'
import { seatMapPath } from '../../utils/rooms.js'

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
  const [success, setSuccess] = useState('')
  const [confirm, setConfirm] = useState('')      // '' | 'cancel' | 'checkout' | 'extend'
  const [busy, setBusy] = useState(false)
  // 확인 버튼을 연달아 눌러도 요청은 한 번만 — state는 다음 렌더에야 바뀐다
  const busyRef = useRef(false)
  const [mode, setMode] = useState('')            // 연장 상한 안내 문구용 운영 모드
  const [now, setNow] = useState(() => Date.now())

  const load = async () => {
    try {
      const r = await reservationApi.myList()
      setReservations(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    load()
    operationApi.get().then(r => setMode(r.data.mode)).catch(() => { /* 안내 문구만 기본값 */ })
  }, [])

  // 화면을 열어둔 채 종료 30분 전이 되면 [연장하기]가 저절로 나타나도록 주기적으로 다시 그린다
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(iv)
  }, [])

  const active = reservations.find(r => ['pending', 'checked_in'].includes(r.status))
  const isPending = active?.status === 'pending'

  // 끝나면 홈으로 돌아가며 완료 안내를 함께 넘긴다
  const finish = (notice) => navigate('/home', { state: { notice } })

  // ── 연장 안내: 시각 계산은 서버가 내려준 extendable_from·extend_to만 쓴다 ──
  // 정지 중에는 서버가 403으로 막으므로 안내도 버튼도 내린다
  const isUsing = active?.status === 'checked_in' && !user?.is_suspended
  const canExtend = isUsing && !!active.extend_to && inExtendWindow(active, now)
  let extendHint = ''
  if (isUsing && !active.extend_to) {
    extendHint = mode === 'extended'
      ? '밤 이용은 09:00까지예요'
      : '운영 마감 시간이라 더 연장할 수 없어요'
  } else if (isUsing && active.extendable_from && now < parseUTC(active.extendable_from).getTime()) {
    extendHint = `${fmtTime(active.extendable_from)}부터 연장할 수 있어요`
  }

  const run = async () => {
    if (!active || busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(''); setSuccess('')
    try {
      if (confirm === 'extend') {
        const r = await reservationApi.extend(active.id)
        setSuccess(`${fmtTime(r.data.usage_ends_at)}까지 연장되었어요`)
        setConfirm('')
        setNow(Date.now())
        await load()
      } else if (confirm === 'cancel') {
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
    } finally { busyRef.current = false; setBusy(false) }
  }

  const DIALOGS = {
    cancel: {
      title: '예약을 취소할까요?',
      description: `${active?.seat_number || ''} 자리 예약이 취소되고, 다시 이용하려면 자리 화면에서 새로 골라야 해요.`,
      confirmLabel: '예약 취소', tone: 'danger',
    },
    checkout: {
      title: '퇴실할까요?',
      description: `${active?.seat_number || ''} 자리 이용이 끝나고 다른 학우가 바로 예약할 수 있게 됩니다.`,
      confirmLabel: '퇴실', tone: 'danger',
    },
    extend: {
      title: '이용 시간을 연장할까요?',
      description: `종료 시각이 ${fmtTime(usageEndIso(active))} → ${fmtTime(active?.extend_to)}로 바뀝니다.`,
      confirmLabel: '연장하기', tone: 'primary',
    },
  }
  const dialog = DIALOGS[confirm]

  const floor = floorOf(active?.seat_number)

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/home')}>
        <IconBack size={16} aria-hidden="true" /> 홈
      </Button>
      <PageTitle>내 자리</PageTitle>

      {error && <Notice tone="danger">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      {canExtend && (
        <Notice
          tone="info"
          title={`지금 연장할 수 있어요 · ${fmtTime(active.usage_ends_at)} 종료 예정`}
          action={<Button size="sm" onClick={() => setConfirm('extend')}>연장하기</Button>}
        />
      )}

      {loading ? (
        <LoadingBox />
      ) : active ? (
        <Card elevated>
          <div className="status-row">
            <StatusCell label="자리">{active.seat_number || '—'}</StatusCell>
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
          {extendHint && <p className="text-muted my-seat-extend-hint">{extendHint}</p>}

          <div className="my-seat-actions mt-4">
            {/* 정지 중에는 체크인을 서버가 403으로 막으므로 버튼을 내린다.
                자리를 비우는 예약 취소·퇴실은 정지 중에도 그대로 쓸 수 있다. */}
            {isPending && !user?.is_suspended && (
              <Button onClick={() => navigate(`/checkin/${active.id}`)}>
                <IconQr size={18} aria-hidden="true" /> QR 체크인
              </Button>
            )}
            {canExtend && (
              <Button onClick={() => setConfirm('extend')}>연장하기</Button>
            )}
            <Button variant="secondary" onClick={() => navigate(seatMapPath(active.location))}>
              <IconSeatMap size={18} aria-hidden="true" /> 배치도에서 보기
            </Button>
            <Button variant="danger" onClick={() => setConfirm(isPending ? 'cancel' : 'checkout')}>
              {isPending ? '예약 취소' : '퇴실'}
            </Button>
          </div>
        </Card>
      ) : (
        <Card elevated>
          <EmptyState
            title="이용 중인 자리가 없어요"
            action={<Button onClick={() => navigate('/seats')}>자리 예약하기</Button>}
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
                <tr><th>자리</th><th>예약 시간</th><th>상태</th></tr>
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

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          tone={dialog.tone}
          busy={busy}
          onConfirm={run}
          onCancel={() => setConfirm('')}
        />
      )}
    </div>
  )
}
