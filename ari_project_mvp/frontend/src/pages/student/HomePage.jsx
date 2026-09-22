import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { operationApi, reportApi, reservationApi, verificationApi } from '../../api/index.js'
import PenaltyNotice from '../../components/PenaltyNotice.jsx'
import {
  Button, Card, HomeTile, LoadingBox, Notice,
} from '../../components/ui/index.js'
import {
  IconExit, IconMail, IconQr, IconSeat, IconUser,
} from '../../components/ui/icons.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fmtDate, fmtTime, parseUTC } from '../../utils/helpers.js'

// 경고 누적 한도 — 관리자 화면과 같은 기준(3회)
const WARNING_LIMIT = 3
// 만료 안내를 닫은 예약 id를 기억하는 자리
const EXPIRED_SEEN_KEY = 'ari_home_expired_seen'

// usage_ends_at 도입 전에 체크인된 예약을 위한 예전 계산 (백엔드 max_usage_seconds)
const MAX_USAGE_MS = 2 * 60 * 60 * 1000

function usageEndIso(r) {
  if (r?.usage_ends_at) return r.usage_ends_at
  if (r?.checked_in_at) return new Date(parseUTC(r.checked_in_at).getTime() + MAX_USAGE_MS).toISOString()
  return null
}

// localStorage는 시크릿 모드·차단 설정에서 던질 수 있다. 실패해도 화면은 돌아가야 한다.
function readSeen() {
  try { return localStorage.getItem(EXPIRED_SEEN_KEY) || '' } catch { return '' }
}
function writeSeen(id) {
  try { localStorage.setItem(EXPIRED_SEEN_KEY, id) } catch { /* 안내만 한 번 더 뜰 뿐 */ }
}

/** (a) 프로필 줄 — 아바타 · 인사 · 학번 · 현재 상태 · 경고 횟수 */
function ProfileRow({ user, statusLine, warnings }) {
  return (
    <div className="home-profile">
      <span className="home-avatar" aria-hidden="true">
        <IconUser size={36} strokeWidth={1.5} />
      </span>
      <div className="home-profile-text">
        <p className="home-greeting">
          <strong>{user?.name || '—'}</strong> 학생, 반가워요!
        </p>
        <p className="home-student-id">{user?.student_id || '—'}</p>
        <p className="home-state">
          <span className="home-state-line">{statusLine}</span>
          {warnings > 0 && (
            <span className="home-warning">경고 {warnings}회(/{WARNING_LIMIT})</span>
          )}
        </p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [reservations, setReservations] = useState([])
  const [penalties, setPenalties] = useState([])
  const [records, setRecords] = useState([])
  const [op, setOp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expiredSeen, setExpiredSeen] = useState(readSeen)

  // /my-seat에서 넘겨준 완료 안내는 한 번만 보여주고 기록에서 지운다
  const [flash, setFlash] = useState(location.state?.notice || '')
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null })
  }, [])

  useEffect(() => {
    refreshUser?.().catch(() => {})
    Promise.allSettled([
      reservationApi.myList().then(r => setReservations(r.data)),
      reportApi.myPenalties().then(r => setPenalties(r.data)),
      verificationApi.myStatus().then(r => setRecords(r.data)),
      operationApi.get().then(r => setOp(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingBox />

  const now = Date.now()
  const active = reservations.find(r => ['pending', 'checked_in'].includes(r.status))
  const isPending = active?.status === 'pending'
  const isUsing = active?.status === 'checked_in'

  // 정지 — 계정 플래그와 아직 안 끝난 패널티 중 하나라도 걸리면 정지로 본다
  const liveSuspension = penalties.find(p => p.ends_at && parseUTC(p.ends_at).getTime() > now)
  const suspended = !!user?.is_suspended || !!liveSuspension
  const suspendedUntil = user?.suspended_until || liveSuspension?.ends_at

  // 경고 횟수 — 철회된 건은 서버가 이미 빼고 내려주고, 여기서 이번 학기
  // (관리자가 누적을 초기화한 시점 이후) 건만 센다
  const warnings = penalties.filter(p => p.counts_toward_total !== false).length

  const closed = !!op && !op.is_open_now

  // ── 미인증 학생: 홈 자리에 인증 안내 ──────────────────────────────────
  const verified = !!user?.is_verified
  const latestRecord = records[0] || null
  const reviewing = records.some(r => r.status === 'pending')
  const rejected = !reviewing && latestRecord?.status === 'rejected'

  const footer = <p className="home-footer">안양대학교 학우실 체크인 시스템</p>
  const moreButton = (
    <Button variant="secondary" block onClick={() => navigate('/more')}>더보기</Button>
  )

  if (!verified) {
    return (
      <>
        <div className="home-center">
          <ProfileRow user={user} statusLine="현재 이용중인 자리 없음" warnings={warnings} />

          {rejected ? (
            <Notice
              tone="danger" lg title="인증이 거절되었어요"
              action={<Button block onClick={() => navigate('/verify')}>다시 제출하기</Button>}
            >
              사유: {latestRecord?.admin_note || '사유가 기록되지 않았습니다'}
            </Notice>
          ) : (
            <Card elevated title={reviewing ? '인증 확인 중이에요' : '아직 재학생 인증이 되지 않았어요'}>
              {reviewing ? (
                <p className="home-card-desc">관리자가 확인하면 바로 이용할 수 있어요.</p>
              ) : (
                <Button block onClick={() => navigate('/verify')}>학생 인증하기</Button>
              )}
            </Card>
          )}

          {moreButton}
        </div>
        {footer}
      </>
    )
  }

  // ── 현재 상태 한 줄 ──────────────────────────────────────────────────
  let statusLine = '현재 이용중인 자리 없음'
  if (isPending) {
    statusLine = `${active.seat_number || '—'} 자리 예약 중 · 체크인 마감 ${fmtTime(active.expires_at)}`
  } else if (isUsing) {
    statusLine = `${active.seat_number || '—'} 자리 이용 중 · ${fmtTime(usageEndIso(active))}까지`
  }

  // ── 타일 4개 ────────────────────────────────────────────────────────
  const seatTile = suspended
    ? { disabled: true, note: '이용 정지 중', label: '자리 예약' }
    : closed
      ? { disabled: true, note: '지금은 이용 시간이 아니에요', label: '자리 예약' }
      : active
        ? { label: '내 자리 보기', to: '/my-seat' }
        : { label: '자리 현황 및 예약', to: '/seats' }

  const qrTile = suspended
    ? { disabled: true, note: '이용 정지 중' }
    : isPending
      ? { note: `마감 ${fmtTime(active.expires_at)}`, to: `/checkin/${active.id}` }
      : isUsing
        ? { disabled: true, note: '이미 체크인했어요' }
        : { disabled: true, note: '예약 후 사용할 수 있어요' }

  // 정지 중에도 쓰던 자리를 비우는 건 막지 않는다 (서버도 취소·퇴실은 허용)
  const exitTile = isPending
      ? { label: '예약 취소', to: '/my-seat' }
      : isUsing
        ? { label: '퇴실', to: '/my-seat' }
        : { disabled: true, note: '이용 중인 자리가 없어요', label: '퇴실·예약 취소' }

  // ── 예약 만료 안내 ──────────────────────────────────────────────────
  const latestReservation = reservations[0] || null
  const showExpired =
    latestReservation?.status === 'expired' && expiredSeen !== latestReservation.id
  const dismissExpired = () => {
    writeSeen(latestReservation.id)
    setExpiredSeen(latestReservation.id)
  }

  return (
    <>
      <div className="home-center">
        <ProfileRow user={user} statusLine={statusLine} warnings={warnings} />

        {flash && <Notice tone="success">{flash}</Notice>}

        {suspended && (
          <Notice tone="danger" title={
            suspendedUntil
              ? `${fmtDate(suspendedUntil)}까지 이용이 정지되었어요`
              : '이용이 정지되었어요'
          } />
        )}

        <PenaltyNotice hideSuspension={suspended} />

        {showExpired && (
          <Notice
            tone="neutral"
            title="예약 시간 10분이 지나 예약이 취소됐어요"
            action={<Button variant="secondary" size="sm" onClick={dismissExpired}>확인</Button>}
          />
        )}

        <Card elevated>
          <p className="home-card-lead">무엇을 도와드릴까요?</p>

          <div className="home-tiles">
            <HomeTile
              icon={IconSeat} label={seatTile.label} note={seatTile.note}
              disabled={seatTile.disabled}
              onClick={() => navigate(seatTile.to)}
            />
            <HomeTile
              icon={IconQr} label="QR 체크인" note={qrTile.note}
              disabled={qrTile.disabled}
              onClick={() => navigate(qrTile.to)}
            />
            <HomeTile
              icon={IconExit} label={exitTile.label} note={exitTile.note}
              disabled={exitTile.disabled}
              onClick={() => navigate(exitTile.to)}
            />
            <HomeTile
              icon={IconMail} label="민원 신고"
              onClick={() => navigate('/report')}
            />
          </div>

          {moreButton}
        </Card>
      </div>

      {footer}
    </>
  )
}
