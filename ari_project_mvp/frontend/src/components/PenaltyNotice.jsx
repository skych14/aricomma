import React, { useEffect, useState } from 'react'
import { reportApi } from '../api/index.js'
import { fmtDate, fmtDatetime } from '../utils/helpers.js'
import { Button, Notice } from './ui/index.js'

/**
 * 내가 받은 패널티 안내. 홈 화면 상단에 눈에 띄게 보여준다.
 * 확인(ack)을 누르면 사라지지만, 정지 중에는 계속 표시한다.
 *
 * @param {boolean} hideSuspension  정지 안내를 이미 따로 띄우는 화면(홈)에서 true.
 *                                  같은 말이 두 번 뜨지 않게 정지 건은 여기서 빼고,
 *                                  아직 확인하지 않은 경고만 남긴다.
 */
export default function PenaltyNotice({ hideSuspension = false }) {
  const [penalties, setPenalties] = useState([])

  const load = () => {
    reportApi.myPenalties().then(r => setPenalties(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const ack = async (id) => {
    try { await reportApi.ackPenalty(id) } catch { /* 안내만 유지 */ }
    load()
  }

  const now = Date.now()
  const isActiveSuspension = (p) =>
    p.ends_at && new Date(p.ends_at + (/[Z+]/.test(p.ends_at) ? '' : 'Z')).getTime() > now

  // 확인 전이거나, 아직 정지 중이면 계속 보여준다
  const visible = penalties.filter(p =>
    hideSuspension
      ? !p.acknowledged_at && !isActiveSuspension(p)
      : !p.acknowledged_at || isActiveSuspension(p))
  if (visible.length === 0) return null

  return (
    <>
      {visible.map(p => {
        const suspended = isActiveSuspension(p)
        return (
          <Notice
            key={p.id}
            tone={suspended ? 'danger' : 'warning'}
            title={suspended
              ? `이용이 정지되었습니다 — 해제 예정 ${fmtDatetime(p.ends_at)}`
              : `${p.level_label}를 받았습니다`}
            action={!p.acknowledged_at && (
              <Button variant="secondary" size="sm" onClick={() => ack(p.id)}>확인</Button>
            )}
          >
            사유: {p.reason} · {fmtDate(p.starts_at)}
          </Notice>
        )
      })}
    </>
  )
}
