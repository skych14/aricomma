import React, { useEffect, useMemo, useState } from 'react'
import { reportApi, seatApi } from '../../api/index.js'
import {
  REPORT_CATEGORIES, errMsg, fmtDatetime, fmtTime,
} from '../../utils/helpers.js'

const MEMO_MAX = 300
const LOOKBACK_HOURS = 24

// 30분 단위 시각 목록 ("00:00" ~ "23:30")
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 ? '30' : '00'
  return `${h}:${m}`
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
  const [seats, setSeats] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [location, setLocation] = useState('')
  const [seatId, setSeatId] = useState('')
  const [category, setCategory] = useState('')
  const [dayOffset, setDayOffset] = useState(0)   // 0 = 오늘, -1 = 어제
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
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
    const now = Date.now()
    return t > now || t < now - LOOKBACK_HOURS * 3600 * 1000
  }

  const valid = seatId && category && fromTime && toTime && fromTime < toTime

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    if (!valid) { setError('좌석, 유형, 시간대를 모두 선택해주세요'); return }
    setSubmitting(true)
    try {
      const dateKey = kstDateKey(dayOffset)
      await reportApi.create({
        seat_id: seatId,
        category,
        occurred_from: kstToIso(dateKey, fromTime),
        occurred_to: kstToIso(dateKey, toTime),
        memo: memo.trim() || undefined,
      })
      setMsg('접수되었습니다. 관리자 확인 후 처리됩니다')
      setSeatId(''); setCategory(''); setFromTime(''); setToTime(''); setMemo('')
      load()
    } catch (err) { setError(errMsg(err)) }
    finally { setSubmitting(false) }
  }

  return (
    <div>
      <h1 className="page-title">신고하기</h1>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <div className="card-title">어디서 있었던 일인가요?</div>

        <div className="form-group">
          <label className="form-label">학우실</label>
          <select className="form-input" value={location}
            onChange={e => { setLocation(e.target.value); setSeatId('') }}>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">좌석</label>
          <select className="form-input" value={seatId} onChange={e => setSeatId(e.target.value)}>
            <option value="">좌석을 선택하세요</option>
            {locationSeats.map(s => (
              <option key={s.id} value={s.id}>{s.seat_number} ({s.floor}층)</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">무슨 일이 있었나요?</label>
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

        <div className="form-group">
          <label className="form-label">언제였나요? <span className="text-muted">(최근 24시간)</span></label>
          <div className="flex gap-2 mb-2">
            {[[0, '오늘'], [-1, '어제']].map(([off, label]) => (
              <button type="button" key={off}
                className={`btn btn-sm ${dayOffset === off ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setDayOffset(off); setFromTime(''); setToTime('') }}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select className="form-input" value={fromTime} onChange={e => setFromTime(e.target.value)}>
              <option value="">시작</option>
              {TIME_SLOTS.map(t => (
                <option key={t} value={t} disabled={slotDisabled(t)}>{t}</option>
              ))}
            </select>
            <span style={{ alignSelf: 'center' }}>~</span>
            <select className="form-input" value={toTime} onChange={e => setToTime(e.target.value)}>
              <option value="">종료</option>
              {TIME_SLOTS.map(t => (
                <option key={t} value={t} disabled={slotDisabled(t) || (fromTime && t <= fromTime)}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">메모 <span className="text-muted">(선택)</span></label>
          <textarea className="form-input" rows={3} maxLength={MEMO_MAX} value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="상황을 간단히 적어주세요" />
          <div className="form-hint">{memo.length} / {MEMO_MAX}자</div>
        </div>

        <div className="report-notice">
          신고 내용은 관리자만 확인합니다. 신고자 정보는 상대방에게 공개되지 않아요.
          사실과 다른 신고가 반복되면 이용이 제한될 수 있습니다.
        </div>

        <button className="btn btn-primary btn-block" disabled={submitting || !valid}>
          {submitting ? <><span className="spinner" /> 접수 중...</> : '신고하기'}
        </button>
      </form>

      <div className="card">
        <div className="card-title">내 신고 내역</div>
        {loading ? (
          <div className="loading-box"><span className="spinner" /></div>
        ) : reports.length === 0 ? (
          <div className="text-muted">신고 내역이 없습니다.</div>
        ) : (
          <ul className="record-list">
            {reports.map(r => (
              <li key={r.id} className="record-card">
                <div className="record-card-head">
                  <div>
                    <strong>{r.category_label}</strong>{' '}
                    <span className="text-muted">{r.location} {r.seat_number}</span>
                  </div>
                  <span className={`badge ${r.status === 'pending' ? 'badge-pending' : 'badge-approved'}`}>
                    {r.status_label}
                  </span>
                </div>
                <div className="record-card-meta">
                  {fmtTime(r.occurred_from)}~{fmtTime(r.occurred_to)} · 접수 {fmtDatetime(r.created_at)}
                </div>
                {r.memo && <div className="record-card-note">{r.memo}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
