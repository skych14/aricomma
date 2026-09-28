import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { operationApi, reservationApi, seatApi } from '../../api/index.js'
import OperationBanner from '../../components/OperationBanner.jsx'
import {
  Button, EmptyState, HomeTile, LoadingBox, Notice, PageTitle, SeatTile,
} from '../../components/ui/index.js'
import { IconBack } from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fmtTime } from '../../utils/helpers.js'
import { ACCESSIBLE_SEATS, GENDERS, HOUSES } from '../../utils/rooms.js'

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

// 일반방 2층 침대의 사다리 (시안: 남학우실 일반방 1:223) — 보이는 크기 17×27.
// 기둥 2개 + 발판 4개(위아래 끝 포함 균등), 선 3.5px에 둥근 끝.
// 둥근 끝이 선 굵기의 절반(1.75px)만큼 밖으로 나가므로 그만큼 안쪽에서 그려야
// viewBox 17×27를 여백 없이 꽉 채운다.
const LADDER = { w: 17, h: 27, stroke: 3.5 }
const LD_IN = LADDER.stroke / 2
const LD_X2 = LADDER.w - LD_IN
const LD_Y2 = LADDER.h - LD_IN
const LD_RUNGS = [0, 1, 2, 3].map(i => LD_IN + ((LD_Y2 - LD_IN) / 3) * i)

function BunkLadder(props) {
  return (
    <svg
      viewBox={`0 0 ${LADDER.w} ${LADDER.h}`}
      aria-hidden="true" focusable="false"
      fill="none" strokeWidth={LADDER.stroke} strokeLinecap="round"
      {...props}
    >
      <line x1={LD_IN} y1={LD_IN} x2={LD_IN} y2={LD_Y2} />
      <line x1={LD_X2} y1={LD_IN} x2={LD_X2} y2={LD_Y2} />
      {LD_RUNGS.map(y => <line key={y} x1={LD_IN} y1={y} x2={LD_X2} y2={y} />)}
    </svg>
  )
}

/** 배치도의 좌석 한 칸 — 서버 좌석 객체를 SeatTile props로 옮긴다. */
function Seat({ seat, accessible, selected, mine, readOnly, onSelect, className = '', style, free }) {
  if (!seat) return null
  // 보기 전용일 때도 이용가능/이용불가는 그대로 보여준다 — 현황을 보는 화면이라
  // 빈자리가 어디인지가 그대로 읽혀야 한다.
  const status = mine ? 'reserved-by-me'
    : !isAvailable(seat) ? 'unavailable'
      : selected ? 'selected' : 'available'
  return (
    <SeatTile
      seatNumber={seat.seat_number}
      floor={seat.floor}
      status={status}
      accessible={accessible}
      free={free}
      readOnly={readOnly}
      className={className}
      style={style}
      onSelect={readOnly ? undefined : () => onSelect(seat)}
    />
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

function BunkPair({ pair, getSeatProps }) {
  return (
    <div className="bunk-pair">
      <Seat seat={pair[2]} className="bunk-pair-upper" {...getSeatProps(pair[2])} />
      <Seat seat={pair[1]} className="bunk-pair-lower" {...getSeatProps(pair[1])} />
      {/* 두 칸 위에 겹쳐 그린다 — 클릭은 CSS의 pointer-events: none으로 통과시킨다 */}
      <BunkLadder className="bunk-pair-ladder" />
    </div>
  )
}

function GridRoom({ room, bunks, getSeatProps }) {
  const lastRow = room.rows.length - 1
  return (
    <div className="grid-room">
      {room.rows.map((row, i) => (
        <div key={i} className="grid-room-row">
          {row.map((group, j) => (
            <div key={j} className="grid-room-cell">
              {group && bunks[group] && <BunkPair pair={bunks[group]} getSeatProps={getSeatProps} />}
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

function PlanRoom({ room, bunks, getSeatProps }) {
  return (
    // 평면도는 시안 좌표계를 비율로 유지해야 해서 크기를 style로 준다 (위치 계산 예외)
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
            {/* 좌석 위치·크기는 시안 좌표를 %로 바꾼 값 (위치 계산 예외) */}
            <Seat seat={pair[2]} free className="plan-seat"
              style={pct(x, PLAN_SEAT.upperY, PLAN_SEAT.w, PLAN_SEAT.h)} {...getSeatProps(pair[2])} />
            <Seat seat={pair[1]} free className="plan-seat"
              style={pct(x + PLAN_SEAT.lowerDx, PLAN_SEAT.lowerY, PLAN_SEAT.w, PLAN_SEAT.h)} {...getSeatProps(pair[1])} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── 단계 공통: 맨 위 안내 ────────────────────────────────────────────────

/**
 * 세 단계가 모두 같은 자리에 같은 안내를 보여준다 — 운영시간·정지·이미 예약 있음.
 * 3단계까지 내려가서야 "예약할 수 없다"를 알게 되는 일을 막는 것.
 *
 * 3단계는 보기 전용으로 바뀌면서 "내 자리는 …" 안내가 그 자리를 대신하므로
 * hideActive로 예약 안내만 끈다.
 */
function StepNotices({ op, user, active, hideActive = false, onGo }) {
  return (
    <>
      <OperationBanner op={op} />

      {user?.is_suspended && (
        <Notice tone="danger" title="계정이 정지되어 예약할 수 없어요">
          정지가 풀리면 다시 자리를 예약할 수 있어요.
        </Notice>
      )}

      {!user?.is_verified && (
        <Notice
          tone="warning" lg
          title="학생 인증이 필요해요"
          action={<Button block onClick={() => onGo('/verify')}>인증하러 가기</Button>}
        >
          재학생 확인이 끝나야 자리를 예약할 수 있어요.
        </Notice>
      )}

      {active && !hideActive && (
        <Notice
          tone="neutral"
          title={`이미 ${active.seat_number || ''} 자리를 예약했어요`}
          action={<Button variant="secondary" size="sm" onClick={() => onGo('/my-seat')}>내 자리 보기</Button>}
        >
          새로 예약하려면 먼저 예약을 취소하거나 퇴실해야 해요.
        </Notice>
      )}
    </>
  )
}

/** 각 단계 맨 위 "← 뒤로" (1단계는 "← 홈") */
function BackLink({ to, label, onGo, onClick }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick || (() => onGo(to))}>
      <IconBack size={16} aria-hidden="true" /> {label}
    </Button>
  )
}

/** 학우실·방 고르는 큰 버튼 — 홈 타일과 같은 모양, 아래 줄에 남은 자리 수 */
function ChoiceTile({ icon, label, count, onClick }) {
  const empty = count.available === 0
  return (
    <HomeTile
      icon={icon}
      label={label}
      note={empty ? '남은 자리 없음' : `이용 가능 ${count.available}/${count.total}`}
      disabled={empty}
      onClick={onClick}
    />
  )
}

// ── 페이지 ───────────────────────────────────────────────────────────────

export default function SeatsPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const { pathname, key: historyKey } = useLocation()
  const { gender, room: roomKey } = useParams()

  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reserving, setReserving] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [op, setOp] = useState(null)
  const [active, setActive] = useState(null)
  // 보기 전용으로 열었을 때 내 자리로 한 번만 스크롤하기 위한 표시
  const scrolledRef = useRef(false)

  const load = async () => {
    try {
      const r = await seatApi.list()
      setSeats(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || '자리 정보를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  const loadOperation = async () => {
    try { setOp((await operationApi.get()).data) } catch { /* 안내 배너만 생략 */ }
  }

  const loadActive = async () => {
    try {
      const r = await reservationApi.myList()
      setActive(r.data.find(x => ['pending', 'checked_in'].includes(x.status)) || null)
    } catch { /* 안내만 생략 */ }
  }

  useEffect(() => { refreshUser?.().catch(() => {}); load(); loadOperation(); loadActive() }, [])

  // 방을 옮기면 이전 방에서 고른 자리는 버린다
  useEffect(() => { setSelectedId(null); setError(''); scrolledRef.current = false }, [gender, roomKey])

  // 보기 전용으로 열면 내 자리가 화면 가운데 오게 한 번만 스크롤한다.
  // 칸은 배치도 안에 절대 위치로 놓여 있어 ref를 달기 어려우므로 그려진 뒤 찾는다.
  useEffect(() => {
    if (scrolledRef.current || loading || !active) return
    const el = document.querySelector('.seat-map .ui-seat--mine')
    if (!el) return
    scrolledRef.current = true
    el.scrollIntoView({ block: 'center' })
  }, [loading, active, pathname])

  const house = gender ? HOUSES[gender] : null
  const rooms = house?.rooms || []
  const room = roomKey ? rooms.find(r => r.key === roomKey) : null

  // 없는 주소는 1단계로 되돌린다
  if (gender && !house) return <Navigate to="/seats" replace />
  if (roomKey && !room) return <Navigate to="/seats" replace />
  // 방이 하나뿐인 학우실(남학우실)은 방 선택 단계를 건너뛴다
  if (house && !roomKey && rooms.length === 1) {
    return <Navigate to={`/seats/${gender}/${rooms[0].key}`} replace />
  }

  const count = (pred) => {
    const list = seats.filter(pred)
    return { available: list.filter(isAvailable).length, total: list.length }
  }

  const go = (to) => navigate(to)
  // 진행 중인 예약이 있으면 3단계는 고르는 화면이 아니라 현황을 보는 화면이 된다
  const readOnly = !!active && !!room
  const notices = (
    <StepNotices op={op} user={user} active={active} hideActive={readOnly} onGo={go} />
  )

  // ── 1단계: 학우실 선택 ─────────────────────────────────────────────
  if (!house) {
    return (
      <div>
        <BackLink to="/home" label="홈" onGo={go} />
        <PageTitle>어느 학우실을 이용할까요?</PageTitle>
        {notices}
        {error && <Notice tone="danger">{error}</Notice>}

        {loading ? <LoadingBox>자리 정보 불러오는 중...</LoadingBox> : (
          <div className="seat-choices">
            {GENDERS.map(key => (
              <ChoiceTile
                key={key}
                icon={HOUSES[key].icon}
                label={HOUSES[key].label}
                count={count(s => s.room_gender === key)}
                onClick={() => go(`/seats/${key}`)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 2단계: 방 선택 ─────────────────────────────────────────────────
  if (!room) {
    return (
      <div>
        <BackLink to="/seats" label="뒤로" onGo={go} />
        <PageTitle>어느 방을 이용할까요?</PageTitle>
        {notices}
        {error && <Notice tone="danger">{error}</Notice>}

        {loading ? <LoadingBox>자리 정보 불러오는 중...</LoadingBox> : (
          <div className="seat-choices">
            {rooms.map(r => (
              <ChoiceTile
                key={r.key}
                icon={r.icon}
                label={r.label}
                count={count(s => s.location === r.location)}
                onClick={() => go(`/seats/${gender}/${r.key}`)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 3단계: 자리 배치도 ─────────────────────────────────────────────
  const roomSeats = seats.filter(s => s.location === room.location)
  const bunks = groupByBunk(roomSeats)
  const accessible = ACCESSIBLE_SEATS[room.location] || []

  // 고른 자리가 더 이상 이용 가능하지 않으면 선택 해제로 취급
  const selected = roomSeats.find(s => s.id === selectedId && isAvailable(s)) || null

  // 7시간 모드에서 운영시간 밖이면 예약 버튼을 막는다 (백엔드도 409로 거절)
  const closed = op ? !op.is_open_now : false
  // 남학우실은 2단계를 건너뛰었으니 뒤로 가면 1단계다
  const backTo = rooms.length > 1 ? `/seats/${gender}` : '/seats'

  const getSeatProps = (seat) => ({
    accessible: !!seat && accessible.includes(seat.seat_number),
    selected: !readOnly && !!seat && seat.id === selected?.id,
    mine: readOnly && !!seat && seat.id === active.seat_id,
    readOnly,
    onSelect: (s) => { setError(''); setSelectedId(s.id === selected?.id ? null : s.id) },
  })

  // 보기 전용으로 들어왔으면 뒤로 가기는 들어온 곳으로 —
  // 주소로 바로 열었으면(첫 방문이라 history.key가 'default') 더보기로 보낸다
  const goBack = () => {
    if (!readOnly) { go(backTo); return }
    if (historyKey === 'default') navigate('/more')
    else navigate(-1)
  }

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
      loadOperation()
      loadActive()
    } finally {
      setReserving(false)
    }
  }

  return (
    <div>
      <BackLink label="뒤로" onClick={goBack} />
      <PageTitle>{house.label} {room.label}</PageTitle>
      {notices}
      {readOnly && (
        <Notice tone="info" title={`내 자리는 ${active.location} ${active.seat_number}예요`}>
          {active.status === 'pending' &&
            '예약 후 10분 안에 현장 침대의 QR을 스캔해야 자리가 유지돼요.'}
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? (
        <LoadingBox>자리 정보 불러오는 중...</LoadingBox>
      ) : roomSeats.length === 0 ? (
        <EmptyState title="자리 정보가 없습니다." />
      ) : (
        <section className="seat-map" aria-label={`${room.location} 배치도`}>
          <h2 className="seat-map-title">
            {readOnly ? '지금 자리 현황이에요.' : '이용하실 자리를 선택하세요.'}
          </h2>
          {room.type === 'grid'
            ? <GridRoom room={room} bunks={bunks} getSeatProps={getSeatProps} />
            : <PlanRoom room={room} bunks={bunks} getSeatProps={getSeatProps} />}
        </section>
      )}

      {/* 보기 전용이면 고를 수 없으니 예약 바도 없다 */}
      {!readOnly && selected && (
        <div className="seat-action-bar">
          <div className="seat-action-info">
            <strong>{room.location} <span className="seat-no">{selected.seat_number}</span></strong>
            <span>
              {selected.floor}층 · 예약 후 10분 내 QR 체크인
              {op?.usage_ends_at_if_checkin_now && !closed &&
                ` · 지금 체크인하면 ${fmtTime(op.usage_ends_at_if_checkin_now)}까지`}
            </span>
          </div>
          {user?.is_verified ? (
            <Button onClick={handleReserve} loading={reserving} disabled={closed}
              title={closed ? '지금은 이용 시간이 아니에요' : undefined}>
              {closed ? '이용 시간 아님' : '예약하기'}
            </Button>
          ) : (
            <Button onClick={() => navigate('/verify')}>인증하러 가기</Button>
          )}
        </div>
      )}

      {!readOnly && (
        <Notice tone="info">
          자리 예약 후 <strong>10분 내</strong>에 현장 침대에 부착된 QR을 스캔하여 체크인해야 합니다.
          체크인하지 않으면 예약이 자동으로 만료됩니다.
        </Notice>
      )}
    </div>
  )
}
