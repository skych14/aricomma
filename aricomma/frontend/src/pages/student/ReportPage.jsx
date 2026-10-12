import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportApi, seatApi } from '../../api/index.js'
import {
  Button, Card, EmptyState, LoadingBox, Notice, PageTitle, StatusBadge, TextField,
} from '../../components/ui/index.js'
import { IconBack } from '../../components/ui/icons.jsx'
import {
  REPORT_CATEGORIES, errMsg, fmtDatetime, fmtMonthDay, fmtTime12,
} from '../../utils/helpers.js'

const MEMO_MAX = 300
const LOOKBACK_HOURS = 24

// "언제인가요?" 선택지. 숫자는 몇 분 전인지.
const WHEN_NOW = 'now'
const WHEN_CUSTOM = 'custom'
const WHEN_OPTIONS = [
  { key: WHEN_NOW, label: '지금 일어나고 있어요' },
  { key: 30, label: '약 30분 전' },
  { key: 60, label: '약 1시간 전' },
  { key: 120, label: '약 2시간 전' },
  { key: WHEN_CUSTOM, label: '직접 고르기' },
]

// 30분 단위 시각 목록. 값은 24시간("14:00"), 표시는 오전/오후("오후 2:00").
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
  const m = i % 2 ? '30' : '00'
  return {
    value: `${String(hour).padStart(2, '0')}:${m}`,
    label: `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${m}`,
  }
})

/** 한국시간 기준 오늘/어제 날짜 키 (YYYY-MM-DD) */
function kstDateKey(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/** 한국시간 "YYYY-MM-DD HH:MM"을 UTC ISO 문자열로 (오프셋 포함해서 보낸다) */
function kstToIso(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00+09:00`).toISOString()
}

export default function ReportPage() {
  const navigate = useNavigate()
  const [seats, setSeats] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [location, setLocation] = useState('')
  const [seatId, setSeatId] = useState('')
  const [category, setCategory] = useState('')
  const [when, setWhen] = useState(WHEN_NOW)      // WHEN_OPTIONS의 key
  const [dayOffset, setDayOffset] = useState(0)   // 직접 고르기: 0 = 오늘, -1 = 어제
  const [time, setTime] = useState('')            // 직접 고르기: "HH:MM"
  // 요약 줄의 "지금"이 화면을 열어둔 동안 멈춰 있지 않게 주기적으로 다시 그린다
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(iv)
  }, [])
  const [memo, setMemo] = useState('')

  const load = async () => {
    try {
      const [s, r] = await Promise.all([seatApi.list(), reportApi.myList()])
      setSeats(s.data)
      setReports(r.data)
      if (!location && s.data.length) setLocation(s.data[0].location)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const locations = useMemo(
    () => [...new Set(seats.map(s => s.location))], [seats])
  const locationSeats = useMemo(
    () => seats.filter(s => s.location === location), [seats, location])

  // 최근 24시간 밖이거나 미래인 시각은 고를 수 없게 막는다
  const slotDisabled = (hhmm) => {
    const t = new Date(kstToIso(kstDateKey(dayOffset), hhmm)).getTime()
    return t > now || t < now - LOOKBACK_HOURS * 3600 * 1000
  }

  // 신고 기준 시각 (ISO). 지금 신고는 서버가 서버 시각으로 정하므로 화면 표시용일 뿐이다.
  const occurredAt = when === WHEN_NOW ? new Date(now).toISOString()
    : when === WHEN_CUSTOM ? (time ? kstToIso(kstDateKey(dayOffset), time) : '')
      : new Date(now - when * 60 * 1000).toISOString()

  const dayWord = (iso) => {
    const key = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    return key === kstDateKey(0) ? '오늘' : key === kstDateKey(-1) ? '어제' : fmtMonthDay(iso)
  }
  const summary = !occurredAt ? ''
    : when === WHEN_NOW ? `${dayWord(occurredAt)} ${fmtTime12(occurredAt)} 기준으로 신고해요`
      : `${dayWord(occurredAt)} ${fmtTime12(occurredAt)} 무렵`

  const valid = seatId && category && !!occurredAt

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    if (!valid) { setError('자리, 유형, 시각을 모두 선택해주세요'); return }
    setSubmitting(true)
    try {
      await reportApi.create({
        seat_id: seatId,
        category,
        memo: memo.trim() || undefined,
        // 지금 신고의 시각은 서버가 정한다 (휴대폰 시계를 믿지 않게)
        ...(when === WHEN_NOW ? { when: 'now' } : { when: 'past', occurred_at: occurredAt }),
      })
      setMsg('접수되었습니다. 관리자 확인 후 처리됩니다')
      setSeatId(''); setCategory(''); setWhen(WHEN_NOW); setTime(''); setMemo('')
      load()
    } catch (err) { setError(errMsg(err)) }
    finally { setSubmitting(false) }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/home')}>
        <IconBack size={16} aria-hidden="true" /> 홈
      </Button>
      <PageTitle>신고하기</PageTitle>

      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card as="form" elevated title="어디서 있었던 일인가요?" onSubmit={submit}>
        <TextField as="select" label="학우실" value={location}
          onChange={e => { setLocation(e.target.value); setSeatId('') }}>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </TextField>

        <TextField as="select" label="자리" value={seatId} onChange={e => setSeatId(e.target.value)}>
          <option value="">자리를 선택하세요</option>
          {locationSeats.map(s => (
            <option key={s.id} value={s.id}>{s.seat_number} ({s.floor}층)</option>
          ))}
        </TextField>

        <div className="ui-field">
          <span className="ui-field-label">무슨 일이 있었나요?</span>
          <div className="report-categories">
            {REPORT_CATEGORIES.map(c => (
              <button type="button" key={c.key}
                className={`report-category${category === c.key ? ' active' : ''}`}
                aria-pressed={category === c.key}
                onClick={() => setCategory(c.key)}>
                <strong>{c.label}</strong>
                <span>{c.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">언제인가요?</span>
          <div className="report-when">
            {WHEN_OPTIONS.map(o => (
              <Button key={o.key} size="sm" aria-pressed={when === o.key}
                variant={when === o.key ? 'primary' : 'secondary'}
                onClick={() => setWhen(o.key)}>
                {o.label}
              </Button>
            ))}
          </div>
          {when === WHEN_CUSTOM && (
            <div className="report-when-custom">
              <div className="flex gap-2">
                {[[0, '오늘'], [-1, '어제']].map(([off, label]) => (
                  <Button key={off} size="sm" aria-pressed={dayOffset === off}
                    variant={dayOffset === off ? 'primary' : 'secondary'}
                    onClick={() => { setDayOffset(off); setTime('') }}>
                    {label}
                  </Button>
                ))}
              </div>
              <TextField as="select" inline value={time} aria-label="시각"
                onChange={e => setTime(e.target.value)}>
                <option value="">시각 선택 (최근 24시간)</option>
                {TIME_SLOTS.map(t => (
                  <option key={t.value} value={t.value} disabled={slotDisabled(t.value)}>{t.label}</option>
                ))}
              </TextField>
            </div>
          )}
        </div>

        <TextField as="textarea" label="메모" labelNote="(선택)" rows={3} maxLength={MEMO_MAX}
          value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="상황을 간단히 적어주세요"
          hint={`${memo.length} / ${MEMO_MAX}자`} />

        <div className="report-notice">
          신고 내용은 관리자만 확인합니다. 신고자 정보는 상대방에게 공개되지 않아요.
          사실과 다른 신고가 반복되면 이용이 제한될 수 있습니다.
        </div>

        {summary && <p className="report-summary">{summary}</p>}

        <Button type="submit" block loading={submitting} disabled={!valid}>
          {submitting ? '접수 중...' : '신고하기'}
        </Button>
      </Card>

      <Card title="내 신고 내역">
        {loading ? (
          <LoadingBox />
        ) : reports.length === 0 ? (
          <EmptyState title="신고 내역이 없습니다." compact />
        ) : (
          <ul className="record-list">
            {reports.map(r => (
              <li key={r.id} className="record-card">
                <div className="record-card-head">
                  <div>
                    <strong>{r.category_label}</strong>{' '}
                    <span className="text-muted">{r.location} {r.seat_number}</span>
                  </div>
                  <StatusBadge status={r.status} label={r.status_label} />
                </div>
                <div className="record-card-meta">
                  {fmtMonthDay(r.occurred_to)}{' '}
                  {r.is_live
                    ? fmtTime12(r.occurred_to)
                    : `${fmtTime12(r.occurred_from)}~${fmtTime12(r.occurred_to)}`}
                  {' · '}접수 {fmtDatetime(r.created_at)}
                </div>
                {r.memo && <div className="record-card-note">{r.memo}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
