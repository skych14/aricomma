import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { verificationApi } from '../../api/index.js'
import Logo from '../../components/Logo.jsx'
import { Button, MenuItem, StatusBadge } from '../../components/ui/index.js'
import {
  IconBack, IconLogout, IconMail, IconSeat, IconVerify,
} from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'

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

  useEffect(() => {
    verificationApi.myStatus()
      .then(r => setReviewing(r.data.some(v => v.status === 'pending')))
      .catch(() => {})
  }, [])

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
