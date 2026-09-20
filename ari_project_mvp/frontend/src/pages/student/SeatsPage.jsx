import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reservationApi, seatApi } from '../../api/index.js'
import { useAuth } from '../../contexts/AuthContext.jsx'

// 장애인 배려 권장석 — ♿ 표시만 하고 예약 제한·우선권은 없음.
// 좌석번호가 방마다 겹치므로(남/여 일반방 모두 A5-1 존재) 방(location) 단위로 관리
const ACCESSIBLE_SEATS = {
  '남학우실 일반방': ['A5-1'],
  '여학우실 일반방': ['A4-1', 'A6-1'],
}

// 방별 배치도. grid 방의 rows는 [왼쪽 열, 오른쪽 열]의 bunk_group (null = 빈 칸)
// ⚠️ 좌석 위치는 여기에 하드코딩되어 있음. 좌석·방·침대조를 추가/변경하면
//    DB(backend/seed.py, 관리자 화면)와 함께 이 설정도 수정해야 배치도에 표시된다.
//    시안: docs/design/*.png
const ROOMS = {
  male: [
    {
      location: '남학우실 일반방', label: '일반방', type: 'grid', entrance: 'bottom',
      rows: [['A1', 'A3'], ['A2', 'A4'], [null, 'A5']],
    },
  ],
  female: [
    {
      location: '여학우실 일반방', label: '일반방', type: 'grid', entrance: 'right',
      rows: [['A1', 'A4'], ['A2', 'A5'], ['A3', 'A6']],
    },
    { location: '여학우실 굴방', label: '굴방', type: 'plan', groups: ['B1', 'B2', 'B3'] },
  ],
}

const isAvailable = (seat) => seat.current_status === 'available'

function groupByBunk(seats) {
  return seats.reduce((acc, s) => {
    acc[s.bunk_group] = acc[s.bunk_group] || {}
    acc[s.bunk_group][s.floor] = s
    return acc
  }, {})
}

// ── 공통 조각 ────────────────────────────────────────────────────────────

function Ladder(props) {
  return (
    <svg viewBox="0 0 12 28" aria-hidden="true" focusable="false" {...props}>
      <rect x="0" y="0" width="2.6" height="28" rx="1" />
      <rect x="9.4" y="0" width="2.6" height="28" rx="1" />
      {[3.5, 8.75, 14, 19.25, 24.5].map(y => (
        <rect key={y} x="0" y={y - 1.2} width="12" height="2.4" />
      ))}
    </svg>
  )
}

function SeatCard({ seat, accessible, selected, onSelect, className = '', style }) {
  if (!seat) return null
  const available = isAvailable(seat)
  const statusText = available ? '이용가능' : '이용불가'
  return (
    <button
      type="button"
      className={`bunk-seat ${available ? 'is-available' : 'is-unavailable'}${selected ? ' is-selected' : ''} ${className}`}
      style={style}
      disabled={!available}
      aria-pressed={available ? selected : undefined}
      aria-label={`${seat.seat_number}, ${seat.floor}층, ${statusText}${accessible ? ', 장애인 배려 권장석' : ''}`}
      onClick={() => onSelect(seat)}
    >
      <span className="bunk-seat-number">{seat.seat_number}</span>
      <span className="bunk-seat-status">
        {statusText}
        {accessible && <span className="bunk-seat-accessible" aria-hidden="true">♿</span>}
      </span>
    </button>
  )
}

function Entrance({ direction }) {
  return (
    <div className={`room-entrance room-entrance--${direction}`}>
      <span>출입구</span>
      <span className="room-entrance-bar" aria-hidden="true" />
    </div>
  )
}

// ── 일반방: 2열 그리드 ───────────────────────────────────────────────────

function BunkPair({ pair, getCardProps }) {
  return (
    <div className="bunk-pair">
      <SeatCard seat={pair[2]} className="bunk-pair-upper" {...getCardProps(pair[2])} />
      <Ladder className="bunk-pair-ladder" />
      <SeatCard seat={pair[1]} className="bunk-pair-lower" {...getCardProps(pair[1])} />
    </div>
  )
}

function GridRoom({ room, bunks, getCardProps }) {
  const lastRow = room.rows.length - 1
  return (
    <div className="grid-room">
      {room.entrance === 'right' && <Entrance direction="vertical" />}
      {room.rows.map((row, i) => (
        <div key={i} className="grid-room-row">
          {row.map((group, j) => (
            <div key={j} className="grid-room-cell">
              {group && bunks[group] && <BunkPair pair={bunks[group]} getCardProps={getCardProps} />}
            </div>
          ))}
          <div className="grid-room-floors" aria-hidden="true">
            {i === lastRow && <><span className="floor-2f">2F</span><span className="floor-1f">1F</span></>}
          </div>
        </div>
      ))}
      <Entrance direction={room.entrance === 'right' ? 'vertical' : 'horizontal'} />
    </div>
  )
}

// ── 굴방: 평면도 ─────────────────────────────────────────────────────────
// 시안(800×700) 좌표계를 그대로 쓰고, 방 외곽 주변만 잘라서 viewBox로 사용
const VB = { x: 40, y: 20, w: 725, h: 655 }
const pct = (x, y, w, h) => ({
  left: `${((x - VB.x) / VB.w) * 100}%`,
  top: `${((y - VB.y) / VB.h) * 100}%`,
  width: `${(w / VB.w) * 100}%`,
  height: `${(h / VB.h) * 100}%`,
})
const PLAN_SEAT = { w: 135, h: 122, upperY: 48, lowerY: 190, lowerDx: 86 }
const planGroupX = (i) => 72 + i * 219

function PlanRoom({ room, bunks, getCardProps }) {
  return (
    <div className="plan-room" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      <svg className="plan-room-svg" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} aria-hidden="true" focusable="false">
        <rect x="50" y="30" width="705" height="635" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="325" y1="441" x2="755" y2="441" stroke="currentColor" strokeWidth="3" />
        {room.groups.map((_, i) => (
          <Ladder key={i} className="plan-room-ladder" x={planGroupX(i) + 32} y={170} width={22} height={50} />
        ))}
        <text x="697" y="147" className="plan-room-floor" textAnchor="middle" dominantBaseline="middle">2F</text>
        <text x="113" y="285" className="plan-room-floor" textAnchor="middle" dominantBaseline="middle">1F</text>
        <text x="540" y="575" className="plan-room-entrance" textAnchor="end" dominantBaseline="middle">출입구</text>
        <rect x="560" y="520" width="18" height="103" className="plan-room-entrance-bar" />
      </svg>
      {room.groups.map((group, i) => {
        const pair = bunks[group] || {}
        const x = planGroupX(i)
        return (
          <React.Fragment key={group}>
            <SeatCard seat={pair[2]} className="plan-seat"
              style={pct(x, PLAN_SEAT.upperY, PLAN_SEAT.w, PLAN_SEAT.h)} {...getCardProps(pair[2])} />
            <SeatCard seat={pair[1]} className="plan-seat"
              style={pct(x + PLAN_SEAT.lowerDx, PLAN_SEAT.lowerY, PLAN_SEAT.w, PLAN_SEAT.h)} {...getCardProps(pair[1])} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── 페이지 ───────────────────────────────────────────────────────────────

export default function SeatsPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reserving, setReserving] = useState(false)
  const [genderTab, setGenderTab] = useState('male')
  const [roomIdx, setRoomIdx] = useState(0)
  const [selectedId, setSelectedId] = useState(null)

  const load = async () => {
    try {
      const r = await seatApi.list()
      setSeats(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || '좌석 정보를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshUser?.().catch(() => {}); load() }, [])

  const rooms = ROOMS[genderTab]
  const room = rooms[roomIdx] || rooms[0]
  const roomSeats = seats.filter(s => s.location === room.location)
  const bunks = groupByBunk(roomSeats)
  const accessible = ACCESSIBLE_SEATS[room.location] || []

  // 선택한 좌석이 다른 방이거나 더 이상 이용 가능하지 않으면 선택 해제로 취급
  const selected = roomSeats.find(s => s.id === selectedId && isAvailable(s)) || null

  const selectGender = (g) => { setGenderTab(g); setRoomIdx(0); setSelectedId(null); setError('') }
  const selectRoom = (i) => { setRoomIdx(i); setSelectedId(null); setError('') }

  const getCardProps = (seat) => ({
    accessible: !!seat && accessible.includes(seat.seat_number),
    selected: !!seat && seat.id === selected?.id,
    onSelect: (s) => { setError(''); setSelectedId(s.id === selected?.id ? null : s.id) },
  })

  const handleReserve = async () => {
    if (!selected) return
    if (!user?.is_verified) { setError('학생 인증이 필요합니다'); return }
    if (user?.is_suspended) { setError('계정이 정지 상태입니다'); return }

    setError(''); setReserving(true)
    try {
      const r = await reservationApi.create(selected.id)
      navigate(`/checkin/${r.data.id}`)
    } catch (e) {
      setError(e.response?.data?.detail || '예약에 실패했습니다')
      setSelectedId(null)
      load()
    } finally {
      setReserving(false)
    }
  }

  const count = (pred) => {
    const list = seats.filter(pred)
    return { available: list.filter(isAvailable).length, total: list.length }
  }
  const genderCount = { male: count(s => s.room_gender === 'male'), female: count(s => s.room_gender === 'female') }

  return (
    <div>
      <h1 className="page-title">좌석 현황</h1>

      {!user?.is_verified && (
        <div className="verify-gate">
          <strong>학생 인증이 필요해요</strong>
          <p>재학생 확인이 끝나야 좌석을 예약할 수 있어요.</p>
          <button className="btn btn-primary btn-block mt-4" onClick={() => navigate('/verify')}>
            인증하러 가기
          </button>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {/* 성별 탭 */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {[['male', '🚹 남학우실'], ['female', '🚺 여학우실']].map(([g, label]) => (
          <button key={g} className={`tab ${genderTab === g ? 'active' : ''}`} onClick={() => selectGender(g)}>
            {label}
            <span style={{ marginLeft: 6, fontSize: '.75rem', fontWeight: 400 }}>
              ({genderCount[g].available}/{genderCount[g].total})
            </span>
          </button>
        ))}
      </div>

      {/* 방 선택 (여학우실: 일반방 / 굴방) */}
      {rooms.length > 1 && (
        <div className="room-switch" role="group" aria-label="방 선택">
          {rooms.map((r, i) => {
            const c = count(s => s.location === r.location)
            return (
              <button key={r.location} type="button" aria-pressed={r === room}
                className={`room-switch-btn${r === room ? ' active' : ''}`} onClick={() => selectRoom(i)}>
                {r.label} <span className="room-switch-count">{c.available}/{c.total}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="seat-legend" aria-hidden="true">
        <span><i className="seat-legend-swatch is-available" />이용가능</span>
        <span><i className="seat-legend-swatch is-unavailable" />이용불가</span>
        <span><i className="seat-legend-swatch is-selected" />선택</span>
        <span>♿ 배려 권장석</span>
      </div>

      {loading ? (
        <div className="loading-box"><span className="spinner" /> 좌석 정보 불러오는 중...</div>
      ) : roomSeats.length === 0 ? (
        <div className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>좌석 정보가 없습니다.</div>
      ) : (
        <section className="seat-map" aria-label={`${room.location} 배치도`}>
          <h2 className="seat-map-title">이용하실 좌석을 선택하세요.</h2>
          {room.type === 'grid'
            ? <GridRoom room={room} bunks={bunks} getCardProps={getCardProps} />
            : <PlanRoom room={room} bunks={bunks} getCardProps={getCardProps} />}
        </section>
      )}

      {selected && (
        <div className="seat-action-bar">
          <div className="seat-action-info">
            <strong>{room.location} <span className="seat-no">{selected.seat_number}</span></strong>
            <span>{selected.floor}층 · 예약 후 10분 내 QR 체크인</span>
          </div>
          {user?.is_verified ? (
            <button className="btn btn-primary" onClick={handleReserve} disabled={reserving}>
              {reserving ? <span className="spinner" /> : '예약하기'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => navigate('/verify')}>
              인증하러 가기
            </button>
          )}
        </div>
      )}

      <div className="alert alert-info" style={{ marginTop: 8, fontSize: '.82rem' }}>
        좌석 예약 후 <strong>10분 내</strong>에 현장 침대에 부착된 QR을 스캔하여 체크인해야 합니다.
        체크인하지 않으면 예약이 자동으로 만료됩니다.
      </div>
    </div>
  )
}
