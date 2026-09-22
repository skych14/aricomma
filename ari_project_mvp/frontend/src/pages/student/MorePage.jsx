import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { reservationApi, verificationApi } from '../../api/index.js'
import Logo from '../../components/Logo.jsx'
import { Button, MenuItem, StatusBadge } from '../../components/ui/index.js'
import {
  IconBack, IconLogout, IconMail, IconSeat, IconSeatMap, IconVerify,
} from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { seatMapPath } from '../../utils/rooms.js'

const MENU_ICON = 20

/** 학생 인증 상태 배지 — 인증 완료 / 심사 중 / 미인증 */
function VerifyBadge({ verified, reviewing }) {
  if (verified) return <StatusBadge tone="ok" label="인증 완료" />
  if (reviewing) return <StatusBadge tone="wait" label="심사 중" />
  return <StatusBadge tone="neutral" label="미인증" />
}

export default function MorePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [reviewing, setReviewing] = useState(false)
  const [active, setActive] = useState(null)   // 진행 중인 예약(예약 중·이용 중)

  useEffect(() => {
    verificationApi.myStatus()
      .then(r => setReviewing(r.data.some(v => v.status === 'pending')))
      .catch(() => {})
    reservationApi.myList()
      .then(r => setActive(r.data.find(x => ['pending', 'checked_in'].includes(x.status)) || null))
      .catch(() => {})
  }, [])

  // 진행 중인 예약이 있으면 내 자리가 있는 방 배치도로 바로 간다
  const seatsTo = active ? seatMapPath(active.location) : '/seats'
  const seatsNote = active
    ? `${active.seat_number || ''} · ${active.status === 'checked_in' ? '이용 중' : '예약 중'}`
    : ''

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="more-page">
      <Button variant="ghost" size="sm" className="more-back" onClick={() => navigate('/home')}>
        <IconBack size={16} aria-hidden="true" /> 홈
      </Button>

      <div className="more-brand">
        <Logo variant="mark" size={65} />
        <p className="more-brand-name">아리쉼표</p>
      </div>

      <nav aria-label="더보기 메뉴">
        <MenuItem as={Link} to="/verify" icon={<IconVerify size={MENU_ICON} />}>
          <span className="more-row">
            학생 인증
            <VerifyBadge verified={!!user?.is_verified} reviewing={reviewing} />
          </span>
        </MenuItem>

        <MenuItem as={Link} to={seatsTo} icon={<IconSeatMap size={MENU_ICON} />}>
          <span className="more-row">
            자리 현황
            {seatsNote && <span className="more-note">{seatsNote}</span>}
          </span>
        </MenuItem>

        <MenuItem as={Link} to="/my-seat" icon={<IconSeat size={MENU_ICON} />}>
          내 자리·이용 기록
        </MenuItem>

        <MenuItem as={Link} to="/report" icon={<IconMail size={MENU_ICON} />}>
          민원 신고 내역
        </MenuItem>

        <MenuItem className="more-logout" icon={<IconLogout size={MENU_ICON} />} onClick={handleLogout}>
          로그아웃
        </MenuItem>
      </nav>

      <p className="home-footer">안양대학교 학우실 체크인 시스템</p>
    </div>
  )
}
