import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { seatApi } from '../../api/index.js'
import {
  Button, Card, ConfirmDialog, EmptyState, LoadingBox, Notice, PageTitle,
} from '../../components/ui/index.js'
import { IconBack, IconPrint } from '../../components/ui/icons.jsx'
import { errMsg } from '../../utils/helpers.js'

const MALE_ROOM = '남학우실 일반방'
const FEMALE_ROOM = '여학우실 일반방'
const FEMALE_CAVE_ROOM = '여학우실 굴방'
const ICON = 16

// 인쇄 순서: 남학우실 일반방 → 여학우실 일반방 → 여학우실 굴방
const ROOM_ORDER = [MALE_ROOM, FEMALE_ROOM, FEMALE_CAVE_ROOM]

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: MALE_ROOM, label: '남학우실' },
  { key: FEMALE_ROOM, label: '여학우실 일반방' },
  { key: FEMALE_CAVE_ROOM, label: '굴방' },
]

const ROTATE_CONFIRM =
  '재발급하면 지금 붙어 있는 QR 스티커는 바로 쓸 수 없게 됩니다.\n' +
  '새 QR을 인쇄해서 스티커를 교체해야 합니다.'

export default function QrPrintPage() {
  const navigate = useNavigate()
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState(null)      // 재발급 중인 좌석 id ('__all__' = 전체)
  const [confirming, setConfirming] = useState(null)  // 확인창 대상: 좌석 객체 또는 '__all__'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await seatApi.adminList()
      setSeats(r.data.filter(s => s.is_active))
      setError('')
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 방별로 묶고, 방 안에서는 seat_number 순
  const groups = useMemo(() => {
    const visible = filter === 'all' ? seats : seats.filter(s => s.location === filter)
    const known = ROOM_ORDER.filter(room => visible.some(s => s.location === room))
    const others = [...new Set(visible.map(s => s.location))].filter(r => !ROOM_ORDER.includes(r))
    return [...known, ...others].map(room => ({
      room,
      seats: visible
        .filter(s => s.location === room)
        .sort((a, b) => a.seat_number.localeCompare(b.seat_number, 'ko', { numeric: true })),
    }))
  }, [seats, filter])

  const rotateOne = async (seat) => {
    setBusyId(seat.id); setError(''); setMsg('')
    try {
      const r = await seatApi.rotateQr(seat.id)
      // 화면의 QR을 새 토큰으로 즉시 갱신
      setSeats(prev => prev.map(s => (s.id === seat.id ? { ...s, qr_token: r.data.qr_token } : s)))
      setMsg(`${seat.location} ${seat.seat_number} QR을 재발급했습니다. 새 QR을 인쇄해 교체하세요.`)
    } catch (e) { setError(errMsg(e)) }
    finally { setBusyId(null) }
  }

  const rotateAll = async () => {
    setBusyId('__all__'); setError(''); setMsg('')
    try {
      const r = await seatApi.rotateQrAll()
      await load()
      setMsg(`활성 좌석 ${r.data.rotated_count}개의 QR을 모두 재발급했습니다. 전체 스티커를 교체하세요.`)
    } catch (e) { setError(errMsg(e)) }
    finally { setBusyId(null) }
  }

  const runRotate = () => {
    const target = confirming
    setConfirming(null)
    if (target === '__all__') rotateAll()
    else rotateOne(target)
  }

  const totalVisible = groups.reduce((n, g) => n + g.seats.length, 0)

  if (loading) return <LoadingBox />

  return (
    <div>
      <div className="no-print">
        <PageTitle>QR 인쇄</PageTitle>

        {error && <Notice tone="danger">{error}</Notice>}
        {msg && <Notice tone="success">{msg}</Notice>}

        <Notice tone="info">
          QR에는 좌석의 <strong>qr_token</strong> 값만 들어갑니다. 인쇄 후 잘라서 해당 침대에 부착하세요.
        </Notice>

        <div className="qr-print-toolbar">
          {FILTERS.map(f => (
            <Button key={f.key} size="sm" aria-pressed={filter === f.key}
              variant={filter === f.key ? 'primary' : 'secondary'}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
          <span className="text-muted">{totalVisible}석</span>
        </div>

        <div className="qr-print-toolbar">
          <Button size="sm" onClick={() => window.print()}>
            <IconPrint size={ICON} aria-hidden="true" /> 인쇄하기
          </Button>
          <Button size="sm" variant="secondary" disabled={busyId !== null}
            loading={busyId === '__all__'} onClick={() => setConfirming('__all__')}>
            {busyId === '__all__' ? '재발급 중...' : '전체 재발급'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin')}>
            <IconBack size={ICON} aria-hidden="true" /> 관리자 대시보드
          </Button>
        </div>
      </div>

      {groups.map(g => (
        <div key={g.room} className="qr-room-group">
          <div className="qr-room-title">{g.room} ({g.seats.length}석)</div>
          <div className="qr-grid">
            {g.seats.map(s => (
              <div key={s.id} className="qr-card">
                <div className="qr-card-img">
                  <QRCodeSVG value={s.qr_token} level="M" size={132} includeMargin />
                </div>
                <div className="qr-card-name">{s.location} <span className="seat-no">{s.seat_number}</span></div>
                <div className="qr-card-floor">{s.floor}층 ({s.floor === 1 ? '아래 침대' : '위 침대'})</div>
                <div className="qr-card-actions no-print">
                  <Button size="sm" variant="ghost" disabled={busyId !== null}
                    loading={busyId === s.id} onClick={() => setConfirming(s)}>
                    {busyId === s.id ? '' : '재발급'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {totalVisible === 0 && (
        <Card className="no-print"><EmptyState title="표시할 활성 좌석이 없습니다." /></Card>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming === '__all__' ? '전체 QR을 재발급할까요?' : 'QR을 재발급할까요?'}
          description={confirming === '__all__'
            ? `활성 좌석 ${totalVisible}개의 QR을 모두 새로 만듭니다.\n${ROTATE_CONFIRM}`
            : `${confirming.location} ${confirming.seat_number}의 QR을 새로 만듭니다.\n${ROTATE_CONFIRM}`}
          confirmLabel="재발급"
          tone="danger"
          onConfirm={runRotate}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
