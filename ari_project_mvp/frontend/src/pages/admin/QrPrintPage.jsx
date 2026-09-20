import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { seatApi } from '../../api/index.js'
import { errMsg } from '../../utils/helpers.js'

const MALE_ROOM = '남학우실 일반방'
const FEMALE_ROOM = '여학우실 일반방'
const FEMALE_CAVE_ROOM = '여학우실 굴방'

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
  '새 QR을 인쇄해서 스티커를 교체해야 합니다. 진행할까요?'

export default function QrPrintPage() {
  const navigate = useNavigate()
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState(null)   // 재발급 중인 좌석 id ('__all__' = 전체)

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
    if (!window.confirm(ROTATE_CONFIRM)) return
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
    if (!window.confirm(ROTATE_CONFIRM)) return
    setBusyId('__all__'); setError(''); setMsg('')
    try {
      const r = await seatApi.rotateQrAll()
      await load()
      setMsg(`활성 좌석 ${r.data.rotated_count}개의 QR을 모두 재발급했습니다. 전체 스티커를 교체하세요.`)
    } catch (e) { setError(errMsg(e)) }
    finally { setBusyId(null) }
  }

  const totalVisible = groups.reduce((n, g) => n + g.seats.length, 0)

  if (loading) return <div className="loading-box"><span className="spinner" /></div>

  return (
    <div>
      <div className="no-print">
        <h1 className="page-title">QR 인쇄</h1>

        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}

        <div className="alert alert-info">
          QR에는 좌석의 <strong>qr_token</strong> 값만 들어갑니다. 인쇄 후 잘라서 해당 침대에 부착하세요.
        </div>

        <div className="qr-print-toolbar">
          {FILTERS.map(f => (
            <button key={f.key}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
          <span className="text-muted" style={{ fontSize: '.82rem' }}>{totalVisible}석</span>
        </div>

        <div className="qr-print-toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ 인쇄하기</button>
          <button className="btn btn-outline btn-sm" disabled={busyId !== null} onClick={rotateAll}>
            {busyId === '__all__' ? <><span className="spinner" /> 재발급 중...</> : '전체 재발급'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}>← 관리자 대시보드</button>
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
                <div className="qr-card-name">{s.location} {s.seat_number}</div>
                <div className="qr-card-floor">{s.floor}층 ({s.floor === 1 ? '아래 침대' : '위 침대'})</div>
                <div className="qr-card-actions no-print">
                  <button className="btn btn-ghost btn-sm" disabled={busyId !== null}
                    onClick={() => rotateOne(s)}>
                    {busyId === s.id ? <span className="spinner" /> : '재발급'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {totalVisible === 0 && (
        <div className="card text-center text-muted no-print">표시할 활성 좌석이 없습니다.</div>
      )}
    </div>
  )
}
