import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reservationApi, seatApi } from '../../api/index.js'
import { useAuth } from '../../contexts/AuthContext.jsx'

const STATUS_LABEL = { available: '이용 가능', reserved: '예약 중', occupied: '이용 중', inactive: '비활성' }
const SEAT_ICON = { bed: '🛏️' }

export default function SeatsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [reserving, setReserving] = useState(null)
  const [genderTab, setGenderTab] = useState('male')

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

  useEffect(() => { load() }, [])

  const handleReserve = async (seat) => {
    if (seat.current_status !== 'available') return
    if (!user?.is_verified) { setError('학생 인증이 필요합니다'); return }
    if (user?.is_suspended) { setError('계정이 정지 상태입니다'); return }
    if (!confirm(`${seat.seat_number} (🛏️ 침대) 좌석을 예약하시겠습니까?\n예약 후 10분 내에 현장 QR을 스캔하여 체크인해야 합니다.`)) return

    setError(''); setMsg(''); setReserving(seat.id)
    try {
      const r = await reservationApi.create(seat.id)
      setMsg(`${seat.seat_number} 예약 완료! 10분 내에 현장에서 QR을 스캔해 체크인하세요.`)
      navigate(`/checkin/${r.data.id}`)
    } catch (e) {
      setError(e.response?.data?.detail || '예약에 실패했습니다')
    } finally {
      setReserving(null)
    }
  }

  const genderSeats = seats.filter(s => s.room_gender === genderTab)
  const byLocation = genderSeats.reduce((acc, s) => {
    if (!acc[s.location]) acc[s.location] = []
    acc[s.location].push(s)
    return acc
  }, {})

  const maleAvailable = seats.filter(s => s.room_gender === 'male' && s.current_status === 'available').length
  const femaleAvailable = seats.filter(s => s.room_gender === 'female' && s.current_status === 'available').length
  const maleTotal = seats.filter(s => s.room_gender === 'male').length
  const femaleTotal = seats.filter(s => s.room_gender === 'female').length

  return (
    <div>
      <h1 className="page-title">좌석 현황</h1>

      {!user?.is_verified && (
        <div className="alert alert-warning">학생 인증이 완료된 후 예약할 수 있습니다.</div>
      )}
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* 성별 탭 */}
      <div className="tabs">
        <button
          className={`tab ${genderTab === 'male' ? 'active' : ''}`}
          onClick={() => setGenderTab('male')}
        >
          🚹 남학우실
          <span style={{ marginLeft: 6, fontSize: '.75rem', fontWeight: 400 }}>
            ({maleAvailable}/{maleTotal})
          </span>
        </button>
        <button
          className={`tab ${genderTab === 'female' ? 'active' : ''}`}
          onClick={() => setGenderTab('female')}
        >
          🚺 여학우실
          <span style={{ marginLeft: 6, fontSize: '.75rem', fontWeight: 400 }}>
            ({femaleAvailable}/{femaleTotal})
          </span>
        </button>
      </div>

      <div className="flex-between mb-4">
        <div className="text-muted">
          이용 가능 <strong style={{ color: 'var(--success)' }}>
            {genderTab === 'male' ? maleAvailable : femaleAvailable}석
          </strong> / 전체 {genderTab === 'male' ? maleTotal : femaleTotal}석
        </div>
        <div className="flex gap-2" style={{ fontSize: '.82rem' }}>
          <span className="badge badge-available">이용 가능</span>
          <span className="badge badge-reserved">예약 중</span>
          <span className="badge badge-occupied">이용 중</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-box"><span className="spinner" /> 좌석 정보 불러오는 중...</div>
      ) : Object.keys(byLocation).length === 0 ? (
        <div className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>좌석 정보가 없습니다.</div>
      ) : (
        Object.entries(byLocation).map(([loc, locSeats]) => (
          <div key={loc} className="card">
            <div className="card-title">{loc}</div>
            <div className="seat-grid">
              {locSeats.map(seat => (
                <div
                  key={seat.id}
                  className={`seat-card ${seat.current_status}`}
                  onClick={() => handleReserve(seat)}
                  title={seat.current_status === 'available' ? '클릭하여 예약' : STATUS_LABEL[seat.current_status]}
                >
                  {reserving === seat.id ? (
                    <span className="spinner" />
                  ) : (
                    <>
                      <div className="seat-number">
                        {SEAT_ICON[seat.seat_type] || ''} {seat.seat_number}
                      </div>
                      <div className="seat-type">침대</div>
                      <div className="seat-location" style={{ marginTop: 6 }}>
                        <span className={`badge badge-${seat.current_status}`}>
                          {STATUS_LABEL[seat.current_status]}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="alert alert-info" style={{ marginTop: 8, fontSize: '.82rem' }}>
        좌석 예약 후 <strong>10분 내</strong>에 현장 침대에 부착된 QR을 스캔하여 체크인해야 합니다.
        체크인하지 않으면 예약이 자동으로 만료됩니다.
      </div>
    </div>
  )
}
