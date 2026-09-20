import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminUserApi, logApi, reservationApi, seatApi, verificationApi } from '../../api/index.js'
import { errMsg, fmtDatetime, statusBadgeClass, statusLabel } from '../../utils/helpers.js'

// ── 탭 1: 인증 요청 ───────────────────────────────────────────────────────
const REJECT_PRESETS = [
  '화면이 흐려 확인이 어렵습니다',
  '가입한 이름·학번과 제출 화면이 다릅니다',
  '학생증 또는 학적정보 화면이 아닙니다',
]

function ReviewModal({ record, onClose, onReviewed }) {
  const [note, setNote] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [fileType, setFileType] = useState('')
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 제출 파일을 blob으로 받아 검토창 안에서 바로 보여준다 (새 탭 이동 없음)
  useEffect(() => {
    let url = ''
    let cancelled = false
    if (!record.has_file) { setFileError('처리 완료되어 파일이 삭제되었습니다'); return }
    verificationApi.adminFetchFile(record.id)
      .then(res => {
        if (cancelled) return
        url = URL.createObjectURL(res.data)
        setFileUrl(url)
        setFileType(res.data.type || '')
      })
      .catch(e => { if (!cancelled) setFileError(errMsg(e)) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [record.id, record.has_file])

  const isPdf = fileType.includes('pdf')
  const canReject = note.trim().length > 0

  const review = async (action) => {
    if (action === 'reject' && !canReject) return
    setBusy(true); setError('')
    try {
      await verificationApi.adminReview(record.id, { action, admin_note: note.trim() })
      onReviewed(action === 'approve' ? '승인 완료' : '거절 완료')
    } catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="인증 검토">
      <div className="card modal-card">
        <div className="card-title">인증 검토</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="review-file">
          {fileError ? (
            <div className="alert alert-warning" style={{ marginBottom: 0 }}>{fileError}</div>
          ) : !fileUrl ? (
            <div className="loading-box"><span className="spinner" /></div>
          ) : isPdf ? (
            <a className="btn btn-outline btn-block" href={fileUrl} target="_blank" rel="noreferrer">
              📄 PDF 열기
            </a>
          ) : (
            <img src={fileUrl} alt="제출한 화면 캡처" />
          )}
        </div>

        {/* 눈으로 대조하기 쉽게 가입 정보를 이미지 바로 아래에 크게 */}
        <div className="review-identity">
          <div className="review-identity-row"><span>이름</span><strong>{record.user_name}</strong></div>
          <div className="review-identity-row">
            <span>학번</span><strong className="mono-id review-identity-sid">{record.user_student_id}</strong>
          </div>
          <div className="review-identity-row"><span>이메일</span><strong>{record.user_email}</strong></div>
        </div>

        <div className="form-group">
          <label className="form-label">거절 사유 (거절 시 필수)</label>
          <div className="reject-presets">
            {REJECT_PRESETS.map(p => (
              <button key={p} type="button" className="btn btn-sm btn-ghost"
                onClick={() => setNote(p)}>{p}</button>
            ))}
          </div>
          <input className="form-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="거절 사유를 입력하세요" />
        </div>

        <div className="flex gap-2">
          <button className="btn btn-success" disabled={busy} onClick={() => review('approve')}>승인</button>
          <button className="btn btn-danger" disabled={busy || !canReject} onClick={() => review('reject')}>거절</button>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function VerificationsTab({ onPendingCount }) {
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await verificationApi.adminList(filter || null)
      setRecords(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const afterReview = (text) => {
    setMsg(text); setError(''); setSelected(null)
    load(); onPendingCount?.()
  }

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <div className="filter-row">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(s)}>
            {s === '' ? '전체' : statusLabel(s)}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <ul className="record-list">
          {records.map(r => (
            <li key={r.id} className="record-card">
              <div className="record-card-head">
                <div>
                  <strong>{r.user_name}</strong>{' '}
                  <span className="mono-id">{r.user_student_id}</span>
                </div>
                <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
              </div>
              <div className="record-card-meta">{fmtDatetime(r.created_at)}</div>
              {r.admin_note && <div className="record-card-note">{r.admin_note}</div>}
              <div className="record-card-actions">
                {r.status === 'pending' ? (
                  <button className="btn btn-sm btn-outline" onClick={() => setSelected(r)}>검토</button>
                ) : (
                  <span className="text-muted" style={{ fontSize: '.8rem' }}>삭제됨</span>
                )}
              </div>
            </li>
          ))}
          {records.length === 0 && <li className="text-center text-muted" style={{ padding: 20 }}>내역 없음</li>}
        </ul>
      )}

      {selected && (
        <ReviewModal record={selected} onClose={() => setSelected(null)} onReviewed={afterReview} />
      )}
    </div>
  )
}

// ── 탭 2: 좌석 관리 ─────────────────────────────────────────────────────
function SeatsTab() {
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ seat_number: '', seat_type: 'bed', room_gender: 'male', location: '', floor: 1, bunk_group: '' })
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
      setForm({ seat_number: '', seat_type: 'bed', room_gender: 'male', location: '', floor: 1, bunk_group: '' })
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
          <input className="form-input" style={{ width: 100 }} placeholder="번호 (A1-1)" value={form.seat_number}
            onChange={e => setForm({ ...form, seat_number: e.target.value })} required />
          <span className="form-input" style={{ width: 100, display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', cursor: 'default' }}>🛏️ 침대</span>
          <select className="form-input" style={{ width: 120 }} value={form.room_gender}
            onChange={e => setForm({ ...form, room_gender: e.target.value })}>
            <option value="male">🚹 남학우실</option>
            <option value="female">🚺 여학우실</option>
          </select>
          <input className="form-input" style={{ flex: 1, minWidth: 140 }} placeholder="방 (남학우실 일반방)" value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })} required />
          <select className="form-input" style={{ width: 90 }} value={form.floor}
            onChange={e => setForm({ ...form, floor: Number(e.target.value) })}>
            <option value={1}>1층</option>
            <option value={2}>2층</option>
          </select>
          <input className="form-input" style={{ width: 100 }} placeholder="침대조 (A1)" value={form.bunk_group}
            onChange={e => setForm({ ...form, bunk_group: e.target.value })} required />
          <button className="btn btn-primary">추가</button>
        </form>
      </div>

      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>번호</th><th>종류</th><th>학우실</th><th>위치</th><th>층</th><th>침대조</th><th>현황</th><th>활성</th><th>삭제</th></tr>
            </thead>
            <tbody>
              {seats.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.seat_number}</strong></td>
                  <td>🛏️ 침대</td>
                  <td>
                    <span className={`badge ${s.room_gender === 'male' ? 'badge-male' : 'badge-female'}`}>
                      {s.room_gender === 'male' ? '🚹 남학우실' : '🚺 여학우실'}
                    </span>
                  </td>
                  <td>{s.location}</td>
                  <td>{s.floor}층</td>
                  <td>{s.bunk_group}</td>
                  <td><span className={`badge badge-${s.current_status}`}>{statusLabel(s.current_status)}</span></td>
                  <td>
                    <button className={`btn btn-sm ${s.is_active ? 'btn-success' : 'btn-ghost'}`}
                      onClick={() => toggleActive(s)}>
                      {s.is_active ? '활성' : '비활성'}
                    </button>
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
        <strong>QR 스티커 안내:</strong> QR 스티커는 상단의 🖨️ QR 인쇄 화면에서 인쇄하세요.
        학생은 예약 후 현장에서 이 QR을 카메라로 스캔하여 체크인합니다.
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

// ── 탭: 사용자 관리 ──────────────────────────────────────────────────────
const USER_FILTERS = [
  { key: '', label: '전체' },
  { key: 'verified', label: '인증됨' },
  { key: 'unverified', label: '미인증' },
  { key: 'suspended', label: '정지' },
]

function DeleteUserModal({ user, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matched = typed.trim() === user.student_id

  const remove = async () => {
    if (!matched) return
    setBusy(true); setError('')
    try {
      await adminUserApi.remove(user.id)
      onDeleted(`${user.name}(${user.student_id}) 계정을 삭제했습니다`)
    } catch (e) { setError(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="계정 삭제 확인">
      <div className="card modal-card">
        <div className="card-title">계정 삭제</div>
        {error && <div className="alert alert-error">{error}</div>}
        <p style={{ fontSize: '.9rem', marginBottom: 12 }}>
          이 계정과 관련 기록이 모두 삭제됩니다. 계속하려면 학번{' '}
          <strong className="mono-id">{user.student_id}</strong> 를 입력하세요
        </p>
        <input className="form-input" value={typed} onChange={e => setTyped(e.target.value)}
          placeholder="학번 입력" autoFocus />
        <div className="flex gap-2 mt-4">
          <button className="btn btn-danger" disabled={!matched || busy} onClick={remove}>
            {busy ? <span className="spinner" /> : '삭제'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.q = search
      if (filter) params.status = filter
      const r = await adminUserApi.list(params)
      setUsers(r.data)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [search, filter])

  useEffect(() => { load() }, [load])

  const patch = async (user, data, label) => {
    setError(''); setMsg('')
    try {
      await adminUserApi.update(user.id, data)
      setMsg(`${user.name}: ${label}`)
      load()
    } catch (e) { setError(errMsg(e)) }
  }

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form className="filter-row" onSubmit={e => { e.preventDefault(); setSearch(q.trim()) }}>
        <input className="form-input" style={{ flex: 1, minWidth: 140 }} value={q}
          onChange={e => setQ(e.target.value)} placeholder="이름 · 학번 · 이메일 검색" />
        <button className="btn btn-sm btn-primary">검색</button>
      </form>
      <div className="filter-row">
        {USER_FILTERS.map(f => (
          <button key={f.key} className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <ul className="record-list">
          {users.map(u => (
            <li key={u.id} className={`record-card${u.is_suspended ? ' is-suspended' : ''}`}>
              <div className="record-card-head">
                <div>
                  <strong>{u.name}</strong>{' '}
                  <span className="mono-id">{u.student_id}</span>
                </div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {u.role === 'admin' && <span className="badge badge-male">관리자</span>}
                  {u.is_suspended && <span className="badge badge-rejected">정지</span>}
                  <span className={`badge ${u.is_verified ? 'badge-approved' : 'badge-pending'}`}>
                    {u.is_verified ? '인증됨' : '미인증'}
                  </span>
                </div>
              </div>
              <div className="record-card-meta">
                {u.email} · 예약 {u.reservation_count}건 · 가입 {fmtDatetime(u.created_at)}
              </div>
              {u.role !== 'admin' && (
                <div className="record-card-actions">
                  {u.is_suspended ? (
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => patch(u, { is_suspended: false }, '정지 해제됨')}>정지 해제</button>
                  ) : (
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => patch(u, { is_suspended: true }, '정지됨')}>정지</button>
                  )}
                  {u.is_verified && (
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => patch(u, { is_verified: false }, '인증 해제됨')}>인증 해제</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(u)}>삭제</button>
                </div>
              )}
            </li>
          ))}
          {users.length === 0 && <li className="text-center text-muted" style={{ padding: 20 }}>사용자 없음</li>}
        </ul>
      )}

      {deleting && (
        <DeleteUserModal user={deleting} onClose={() => setDeleting(null)}
          onDeleted={(text) => { setDeleting(null); setMsg(text); setError(''); load() }} />
      )}
    </div>
  )
}

// ── 메인 관리자 대시보드 ─────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('verifications')
  const [pendingCount, setPendingCount] = useState(0)

  const loadPendingCount = useCallback(() => {
    verificationApi.adminList('pending')
      .then(r => setPendingCount(r.data.length))
      .catch(() => {})
  }, [])

  useEffect(() => { loadPendingCount() }, [loadPendingCount])

  const TABS = [
    { key: 'verifications', label: '인증', badge: pendingCount },
    { key: 'users', label: '사용자' },
    { key: 'seats', label: '좌석 관리' },
    { key: 'reservations', label: '예약/이용 로그' },
    { key: 'audit', label: '감사 로그' },
  ]

  return (
    <div>
      <div className="flex-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>관리자 대시보드</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/qr-print')}>
          🖨️ QR 인쇄
        </button>
      </div>
      <div className="tabs tabs-scroll" style={{ marginTop: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge > 0 && <span className="tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div>
        {tab === 'verifications' && <VerificationsTab onPendingCount={loadPendingCount} />}
        {tab === 'users' && <UsersTab />}
        {tab === 'seats' && <SeatsTab />}
        {tab === 'reservations' && <ReservationsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}
