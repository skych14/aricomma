import React, { useCallback, useEffect, useState } from 'react'
import { logApi, reservationApi, seatApi, verificationApi } from '../../api/index.js'
import { errMsg, fmtDatetime, statusBadgeClass, statusLabel } from '../../utils/helpers.js'

// ── 탭 1: 인증 요청 ───────────────────────────────────────────────────────
function VerificationsTab() {
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const openFile = async (id) => {
    try {
      const res = await verificationApi.adminFetchFile(id)
      const url = URL.createObjectURL(res.data)
      const win = window.open(url, '_blank')
      if (win) win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
      else URL.revokeObjectURL(url)
    } catch (e) {
      setError('파일을 불러올 수 없습니다: ' + (e.response?.status === 404 ? '파일 없음' : errMsg(e)))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await verificationApi.adminList(filter || null)
      setRecords(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const review = async (action) => {
    if (!selected) return
    try {
      await verificationApi.adminReview(selected.id, { action, admin_note: note })
      setMsg(`${action === 'approve' ? '승인' : '거절'} 완료`)
      setSelected(null); setNote('')
      load()
    } catch (e) { setError(errMsg(e)) }
  }

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <div className="flex gap-2 mb-4">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(s)}>
            {s === '' ? '전체' : statusLabel(s)}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>제출일</th><th>이름</th><th>학번</th><th>상태</th><th>파일</th><th>처리</th></tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>{fmtDatetime(r.created_at)}</td>
                  <td>{r.user_name}</td>
                  <td>{r.user_student_id}</td>
                  <td><span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => openFile(r.id)}>파일 보기</button>
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <button className="btn btn-sm btn-outline"
                        onClick={() => { setSelected(r); setNote(r.admin_note || '') }}>
                        검토
                      </button>
                    )}
                    {r.admin_note && <span className="text-muted" style={{ marginLeft: 6, fontSize: '.8rem' }}>{r.admin_note}</span>}
                  </td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={6} className="text-center text-muted">내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-title">인증 검토 — {selected.user_name} ({selected.user_student_id})</div>
            <div className="mb-4">
              <button className="btn btn-outline btn-sm" onClick={() => openFile(selected.id)}>📄 제출 파일 열기</button>
            </div>
            {selected.ocr_result && (() => {
              try {
                const ocr = JSON.parse(selected.ocr_result)
                return (
                  <div className="alert alert-info" style={{ marginBottom: 12 }}>
                    <strong>Mock OCR 결과</strong><br />
                    이름: {ocr.detected_name} / 학번: {ocr.detected_student_id}<br />
                    신뢰도: {(ocr.confidence * 100).toFixed(0)}%<br />
                    <small>{ocr.note}</small>
                  </div>
                )
              } catch { return null }
            })()}
            <div className="form-group">
              <label className="form-label">관리자 메모 (선택)</label>
              <input className="form-input" value={note} onChange={e => setNote(e.target.value)}
                placeholder="승인/거절 사유 등" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-success" onClick={() => review('approve')}>승인</button>
              <button className="btn btn-danger" onClick={() => review('reject')}>거절</button>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 탭 2: 좌석 관리 ─────────────────────────────────────────────────────
function SeatsTab() {
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ seat_number: '', seat_type: 'bed', location: '' })
  const [editTarget, setEditTarget] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try { const r = await seatApi.adminList(); setSeats(r.data) }
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    try {
      await seatApi.create(form)
      setMsg('좌석이 추가되었습니다')
      setForm({ seat_number: '', seat_type: 'bed', location: '' })
      load()
    } catch (e) { setError(errMsg(e)) }
  }

  const handleDelete = async (id, num) => {
    if (!confirm(`${num} 좌석을 삭제하시겠습니까?`)) return
    try { await seatApi.delete(id); load() }
    catch (e) { setError(errMsg(e)) }
  }

  const toggleActive = async (seat) => {
    try { await seatApi.update(seat.id, { is_active: !seat.is_active }); load() }
    catch (e) { setError(errMsg(e)) }
  }

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-title">좌석 추가</div>
        <form onSubmit={handleCreate} className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <input className="form-input" style={{ width: 100 }} placeholder="번호 (A01)" value={form.seat_number}
            onChange={e => setForm({ ...form, seat_number: e.target.value })} required />
          <span className="form-input" style={{ width: 110, display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', cursor: 'default' }}>🛏️ 침대(bed)</span>
          <input className="form-input" style={{ flex: 1, minWidth: 150 }} placeholder="위치 (1층 좌측)" value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })} required />
          <button className="btn btn-primary">추가</button>
        </form>
      </div>

      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>번호</th><th>종류</th><th>위치</th><th>현황</th><th>활성</th><th>QR 토큰</th><th>삭제</th></tr>
            </thead>
            <tbody>
              {seats.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.seat_number}</strong></td>
                  <td>🛏️ 침대</td>
                  <td>{s.location}</td>
                  <td><span className={`badge badge-${s.current_status}`}>{statusLabel(s.current_status)}</span></td>
                  <td>
                    <button className={`btn btn-sm ${s.is_active ? 'btn-success' : 'btn-ghost'}`}
                      onClick={() => toggleActive(s)}>
                      {s.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.75rem', color: 'var(--gray-600)' }}>
                    {s.qr_token}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(s.id, s.seat_number)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="alert alert-info" style={{ marginTop: 12, fontSize: '.82rem' }}>
        <strong>QR 토큰 안내:</strong> 각 좌석의 QR 토큰을 QR 코드 생성기로 이미지화하여 해당 침대/좌석에 부착하세요.
        학생은 예약 후 현장에서 이 QR을 스캔하여 체크인합니다.
      </div>
    </div>
  )
}

// ── 탭 3: 예약/이용 로그 ─────────────────────────────────────────────────
function ReservationsTab() {
  const [reservations, setReservations] = useState([])
  const [logs, setLogs] = useState([])
  const [tab2, setTab2] = useState('reservations')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      reservationApi.adminList().catch(() => ({ data: [] })),
      logApi.adminUsage().catch(() => ({ data: [] })),
    ]).then(([r1, r2]) => {
      setReservations(r1.data)
      setLogs(r2.data)
    }).catch(e => setError(errMsg(e)))
    .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box"><span className="spinner" /></div>

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="tabs">
        <button className={`tab ${tab2 === 'reservations' ? 'active' : ''}`} onClick={() => setTab2('reservations')}>예약 목록</button>
        <button className={`tab ${tab2 === 'usage' ? 'active' : ''}`} onClick={() => setTab2('usage')}>이용 로그</button>
      </div>
      {tab2 === 'reservations' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>학생</th><th>학번</th><th>좌석</th><th>예약 시간</th><th>상태</th><th>체크인</th><th>퇴실</th></tr>
            </thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td>{r.user_name || '—'}</td>
                  <td>{r.user_student_id || '—'}</td>
                  <td>{r.seat_number || '—'}</td>
                  <td>{fmtDatetime(r.reserved_at)}</td>
                  <td><span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td>{fmtDatetime(r.checked_in_at)}</td>
                  <td>{fmtDatetime(r.checked_out_at)}</td>
                </tr>
              ))}
              {reservations.length === 0 && <tr><td colSpan={7} className="text-center text-muted">내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>시간</th><th>학생</th><th>좌석</th><th>행동</th><th>메모</th></tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{fmtDatetime(l.performed_at)}</td>
                  <td>{l.user_name || '—'}</td>
                  <td>{l.seat_number || '—'}</td>
                  <td><span className={`badge ${statusBadgeClass(l.action)}`}>{statusLabel(l.action)}</span></td>
                  <td className="text-muted">{l.note || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="text-center text-muted">내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 탭 4: 감사 로그 ──────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    logApi.adminAudit()
      .then(r => setLogs(r.data))
      .catch(e => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>시간</th><th>행위자</th><th>액션</th><th>대상 종류</th><th>대상 ID</th><th>IP</th></tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{fmtDatetime(l.created_at)}</td>
                  <td>{l.actor_name || '시스템'}</td>
                  <td><code style={{ fontSize: '.78rem' }}>{l.action_type}</code></td>
                  <td>{l.target_type || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.75rem' }}>{l.target_id ? l.target_id.slice(0, 8) + '…' : '—'}</td>
                  <td className="text-muted">{l.ip_address || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="text-center text-muted">내역 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 메인 관리자 대시보드 ─────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = useState('verifications')

  const TABS = [
    { key: 'verifications', label: '인증 요청' },
    { key: 'seats', label: '좌석 관리' },
    { key: 'reservations', label: '예약/이용 로그' },
    { key: 'audit', label: '감사 로그' },
  ]

  return (
    <div>
      <h1 className="page-title">관리자 대시보드</h1>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === 'verifications' && <VerificationsTab />}
        {tab === 'seats' && <SeatsTab />}
        {tab === 'reservations' && <ReservationsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}
