import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminUserApi, logApi, operationApi, reportApi, reservationApi, seatApi, verificationApi } from '../../api/index.js'
import {
  Button, Card, ConfirmDialog, EmptyState, LoadingBox, Modal,
  Notice, PageTitle, StatusBadge, Tabs, TextField,
} from '../../components/ui/index.js'
import {
  IconCopy, IconDone, IconFile, IconHistory, IconPassword, IconPrint,
  IconSearch, IconSeat,
} from '../../components/ui/icons.jsx'
import {
  PENALTY_LEVELS, errMsg, fmtDate, fmtDatetime, fmtTime, parseUTC,
  penaltyLevelLabel, statusLabel,
} from '../../utils/helpers.js'

const ICON = 16

// ── 운영 모드 카드 ────────────────────────────────────────────────────────
function OperationModeCard({ op, onChanged }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!op) return null

  const isExtended = op.mode === 'extended'
  const nextMode = isExtended ? 'standard' : 'extended'
  const confirmText = isExtended
    ? '평상시 모드로 바꾸면 10:00~17:00에만 예약할 수 있습니다. 지금 이용 중인 학생의 종료 시간은 그대로 유지됩니다. 진행할까요?'
    : '시험기간 모드로 바꾸면 24시간 예약이 가능해집니다. 지금 이용 중인 학생의 종료 시간은 그대로 유지됩니다. 진행할까요?'

  const apply = async () => {
    setBusy(true); setError('')
    try {
      const r = await operationApi.setMode(nextMode)
      setConfirming(false)
      onChanged(r.data)   // 전환 직후 새 모드로 화면 갱신
    } catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <Card elevated title="운영 모드">
      <div className="op-card-now">
        <StatusBadge tone={isExtended ? 'brand' : 'ok'} label={op.mode_label} />
        <span className="op-card-hours">
          {isExtended
            ? '24시간 개방 · 기본 2시간 (22:00~09:00 체크인은 최대 7시간)'
            : `오늘 이용 시간 ${fmtTime(op.opens_at)}~${fmtTime(op.closes_at)} · 기본 2시간`}
        </span>
      </div>

      <div className="op-card-state">
        {op.is_open_now
          ? <span className="op-card-open">지금 예약 가능</span>
          : <span className="op-card-closed">지금은 이용 시간 아님 · 다음 열림 {fmtTime(op.next_open_at)}</span>}
      </div>

      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        {isExtended ? '평상시 7시간 모드로 전환' : '시험기간 24시간 모드로 전환'}
      </Button>

      {confirming && (
        <ConfirmDialog
          title="운영 모드를 바꿀까요?"
          description={confirmText}
          confirmLabel="전환"
          error={error}
          busy={busy}
          onConfirm={apply}
          onCancel={() => { setConfirming(false); setError('') }}
        />
      )}
    </Card>
  )
}

// ── 탭 1: 인증 요청 ───────────────────────────────────────────────────────
const REJECT_PRESETS = [
  '화면이 흐려 확인이 어렵습니다',
  '가입한 이름·학번과 제출 화면이 다릅니다',
  '학생증 또는 학적정보 화면이 아닙니다',
]

const VERIFICATION_FILTERS = [
  { key: '', label: '전체' },
  { key: 'pending', label: statusLabel('pending') },
  { key: 'approved', label: statusLabel('approved') },
  { key: 'rejected', label: statusLabel('rejected') },
]

/** 필터 줄 — 버튼 하나만 켜지는 목록 (탭이 아니라 목록 좁히기) */
function FilterRow({ items, value, onChange, label }) {
  return (
    <div className="filter-row" role="group" aria-label={label}>
      {items.map(f => (
        <Button key={f.key} size="sm" aria-pressed={value === f.key}
          variant={value === f.key ? 'primary' : 'secondary'}
          onClick={() => onChange(f.key)}>{f.label}</Button>
      ))}
    </div>
  )
}

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
    <Modal title="인증 검토" onClose={busy ? undefined : onClose}>
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="review-file">
        {fileError ? (
          <Notice tone="warning" className="mb-0">{fileError}</Notice>
        ) : !fileUrl ? (
          <LoadingBox />
        ) : isPdf ? (
          <a className="ui-btn ui-btn--secondary ui-btn--block" href={fileUrl} target="_blank" rel="noreferrer">
            <IconFile size={ICON} aria-hidden="true" /> PDF 열기
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

      <div className="ui-field">
        <span className="ui-field-label">거절 사유 (거절 시 필수)</span>
        <div className="reject-presets">
          {REJECT_PRESETS.map(p => (
            <Button key={p} size="sm" variant="secondary" alignStart
              onClick={() => setNote(p)}>{p}</Button>
          ))}
        </div>
      </div>
      <TextField value={note} onChange={e => setNote(e.target.value)}
        aria-label="거절 사유" placeholder="거절 사유를 입력하세요" />

      <div className="ui-modal-actions">
        <Button loading={busy} onClick={() => review('approve')}>승인</Button>
        <Button variant="danger" disabled={busy || !canReject} onClick={() => review('reject')}>거절</Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>취소</Button>
      </div>
    </Modal>
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
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <FilterRow items={VERIFICATION_FILTERS} value={filter} onChange={setFilter} label="인증 상태 필터" />

      {loading ? <LoadingBox /> : (
        <ul className="record-list">
          {records.map(r => (
            <li key={r.id} className="record-card">
              <div className="record-card-head">
                <div>
                  <strong>{r.user_name}</strong>{' '}
                  <span className="mono-id">{r.user_student_id}</span>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="record-card-meta">{fmtDatetime(r.created_at)}</div>
              {r.admin_note && <div className="record-card-note">{r.admin_note}</div>}
              <div className="record-card-actions">
                {r.status === 'pending'
                  ? <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>검토</Button>
                  : <span className="record-card-meta">파일 삭제됨</span>}
              </div>
            </li>
          ))}
          {records.length === 0 && <li><EmptyState title="내역 없음" compact /></li>}
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
  const [error, setError] = useState('')

  const load = async () => {
    try { const r = await seatApi.adminList(); setSeats(r.data) }
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (seat) => {
    try { await seatApi.update(seat.id, { is_active: !seat.is_active }); load() }
    catch (e) { setError(errMsg(e)) }
  }

  return (
    <div>
      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? <LoadingBox /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>번호</th><th>종류</th><th>학우실</th><th>위치</th><th>층</th><th>침대조</th><th>현황</th><th>활성</th></tr>
            </thead>
            <tbody>
              {seats.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.seat_number}</strong></td>
                  <td className="cell-icon"><IconSeat size={ICON} aria-hidden="true" /> 침대</td>
                  <td>
                    <StatusBadge tone={s.room_gender === 'male' ? 'brand' : 'neutral'}
                      label={s.room_gender === 'male' ? '남학우실' : '여학우실'} />
                  </td>
                  <td>{s.location}</td>
                  <td>{s.floor}층</td>
                  <td>{s.bunk_group}</td>
                  <td><StatusBadge status={s.current_status} /></td>
                  <td>
                    <Button size="sm" variant={s.is_active ? 'primary' : 'secondary'}
                      onClick={() => toggleActive(s)}>
                      {s.is_active ? '활성' : '비활성'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Notice tone="info" title="QR 스티커 안내">
        QR 스티커는 상단의 QR 인쇄 화면에서 인쇄하세요.
        학생은 예약 후 현장에서 이 QR을 카메라로 스캔하여 체크인합니다.
      </Notice>
    </div>
  )
}

// ── 탭 3: 예약/이용 로그 ─────────────────────────────────────────────────
const RESERVATION_SUBTABS = [
  { key: 'reservations', label: '예약 목록' },
  { key: 'usage', label: '이용 로그' },
]

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

  if (loading) return <LoadingBox />

  return (
    <div>
      {error && <Notice tone="danger">{error}</Notice>}
      <Tabs items={RESERVATION_SUBTABS} value={tab2} onChange={setTab2} label="로그 종류" />
      {tab2 === 'reservations' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>학생</th><th>학번</th><th>자리</th><th>예약 시간</th><th>상태</th><th>체크인</th><th>종료 예정</th><th>퇴실</th></tr>
            </thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td>{r.user_name || '—'}</td>
                  <td>{r.user_student_id || '—'}</td>
                  <td>{r.seat_number || '—'}</td>
                  <td>{fmtDatetime(r.reserved_at)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{fmtDatetime(r.checked_in_at)}</td>
                  <td>{r.usage_ends_at ? fmtTime(r.usage_ends_at) : '—'}</td>
                  <td>{fmtDatetime(r.checked_out_at)}</td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr><td colSpan={8}><EmptyState title="내역 없음" compact /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>시간</th><th>학생</th><th>자리</th><th>행동</th><th>메모</th></tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{fmtDatetime(l.performed_at)}</td>
                  <td>{l.user_name || '—'}</td>
                  <td>{l.seat_number || '—'}</td>
                  <td><StatusBadge status={l.action} /></td>
                  <td className="text-muted">{l.note || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5}><EmptyState title="내역 없음" compact /></td></tr>
              )}
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
      {error && <Notice tone="danger">{error}</Notice>}
      {loading ? <LoadingBox /> : (
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
                  <td><code className="cell-code">{l.action_type}</code></td>
                  <td>{l.target_type || '—'}</td>
                  <td className="mono-id cell-id">{l.target_id ? l.target_id.slice(0, 8) + '…' : '—'}</td>
                  <td className="text-muted">{l.ip_address || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6}><EmptyState title="내역 없음" compact /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 탭: 신고 처리 ────────────────────────────────────────────────────────
const REPORT_FILTERS = [
  { key: 'pending', label: '접수됨' },
  { key: '', label: '전체' },
  { key: 'penalized', label: '처리 완료' },
  { key: 'no_target', label: '대상 확인 불가' },
  { key: 'rejected', label: '반려' },
]

const TERM_DEFAULT_DAYS = 120

/** 오늘 + n일을 <input type="date">용 YYYY-MM-DD로 (한국시간 기준) */
function dateInputValue(days) {
  return new Date(Date.now() + days * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function ReportDetailModal({ report, onClose, onReviewed }) {
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState(null)   // 후보 user_id
  const [level, setLevel] = useState('')
  const [endsAt, setEndsAt] = useState(dateInputValue(TERM_DEFAULT_DAYS))
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    reportApi.adminCandidates(report.id)
      .then(r => setCandidates(r.data))
      .catch(e => { setError(errMsg(e)); setCandidates([]) })
  }, [report.id])

  // 후보를 고르면 권장 단계를 기본값으로 채운다 (관리자가 바꿀 수 있다)
  const pick = (c) => {
    setSelected(c.user_id)
    setLevel(c.recommended_level)
    setError('')
  }

  const target = candidates?.find(c => c.user_id === selected)
  const isTerm = level === 'suspend_term'

  const submit = async (action) => {
    setBusy(true); setError('')
    try {
      const body = { action, admin_note: note.trim() || undefined }
      if (action === 'penalize') {
        body.accused_user_id = selected
        body.level = level
        if (isTerm) body.ends_at = new Date(`${endsAt}T23:59:00+09:00`).toISOString()
      }
      await reportApi.adminReview(report.id, body)
      onReviewed(action === 'penalize' ? '패널티를 부과했습니다'
        : action === 'no_target' ? '대상 확인 불가로 종결했습니다' : '반려했습니다')
    } catch (e) { setError(errMsg(e)); setConfirming(false) }
    finally { setBusy(false) }
  }

  const canPenalize = selected && level && (!isTerm || endsAt) && !target?.is_admin
  const canReject = note.trim().length > 0

  return (
    <Modal title="신고 상세" onClose={busy ? undefined : onClose}>
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="report-detail">
        <div className="report-detail-row"><span>유형</span><strong>{report.category_label}</strong></div>
        <div className="report-detail-row">
          <span>자리</span><strong>{report.location} {report.seat_number}</strong>
        </div>
        <div className="report-detail-row">
          <span>시간대</span><strong>{fmtTime(report.occurred_from)}~{fmtTime(report.occurred_to)}</strong>
        </div>
        <div className="report-detail-row">
          <span>신고자</span>
          <strong>{report.reporter_name} <span className="mono-id">{report.reporter_student_id}</span></strong>
        </div>
      </div>
      {report.memo && <div className="report-detail-memo">{report.memo}</div>}

      <h3 className="section-title section-title--spaced">그 시간대 이용자</h3>
      {candidates === null ? (
        <LoadingBox />
      ) : candidates.length === 0 ? (
        <Notice tone="warning">
          그 시간대에 이 자리를 이용한 기록이 없습니다. 대상 확인 불가로 종결할 수 있어요.
        </Notice>
      ) : (
        <ul className="candidate-list">
          {candidates.map(c => (
            <li key={c.reservation_id}>
              <button type="button"
                className={`candidate${selected === c.user_id ? ' active' : ''}`}
                aria-pressed={selected === c.user_id}
                disabled={c.is_admin}
                onClick={() => pick(c)}>
                <div className="candidate-head">
                  <strong>{c.name} <span className="mono-id">{c.student_id}</span></strong>
                  <StatusBadge tone={c.overlapped ? 'wait' : 'neutral'}
                    label={c.overlapped ? '시간대 겹침' : '직전 이용'} />
                </div>
                <div className="candidate-meta">
                  {fmtTime(c.checked_in_at)}~{c.checked_out_at ? fmtTime(c.checked_out_at) : '이용 중'}
                  {' · '}
                  {c.checkout_kind === 'auto' ? '자동 퇴실'
                    : c.checkout_kind === 'self' ? '본인 퇴실' : '퇴실 기록 없음'}
                </div>
                <div className="candidate-meta">
                  누적 {c.penalty_count}회 · 권장 {penaltyLevelLabel(c.recommended_level)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="ui-field ui-field--spaced">
          <span className="ui-field-label">패널티 단계</span>
          <div className="filter-row">
            {PENALTY_LEVELS.map(l => (
              <Button key={l.key} size="sm" aria-pressed={level === l.key}
                variant={level === l.key ? 'primary' : 'secondary'}
                onClick={() => setLevel(l.key)}>{l.label}</Button>
            ))}
          </div>
          {isTerm && (
            <TextField label="해제 예정일" type="date" value={endsAt}
              min={dateInputValue(1)} onChange={e => setEndsAt(e.target.value)} />
          )}
          {level === 'suspend_week' && (
            <div className="ui-field-hint">1주 정지의 해제일은 부과 시각 기준으로 서버가 계산합니다.</div>
          )}
        </div>
      )}

      <TextField label="관리자 메모" labelNote="(반려 시 필수)" value={note}
        onChange={e => setNote(e.target.value)} placeholder="처리 사유" />

      <div className="ui-modal-actions">
        <Button variant="danger" size="sm" disabled={!canPenalize || busy}
          onClick={() => setConfirming(true)}>패널티 부과</Button>
        <Button variant="secondary" size="sm" disabled={busy}
          onClick={() => submit('no_target')}>대상 확인 불가로 종결</Button>
        <Button variant="secondary" size="sm" disabled={!canReject || busy}
          onClick={() => submit('reject')}>반려</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>닫기</Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="패널티를 부과할까요?"
          description={`${target?.name}(${target?.student_id})에게 ${penaltyLevelLabel(level)}를 부과합니다. 진행 중인 예약은 취소됩니다.`}
          confirmLabel="부과"
          tone="danger"
          busy={busy}
          onConfirm={() => submit('penalize')}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Modal>
  )
}

function ReportsTab({ onPendingCount }) {
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reportApi.adminList(filter || null)
      setReports(r.data)
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
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <FilterRow items={REPORT_FILTERS} value={filter} onChange={setFilter} label="신고 상태 필터" />

      {loading ? <LoadingBox /> : (
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
                {fmtTime(r.occurred_from)}~{fmtTime(r.occurred_to)} · 접수 {fmtDatetime(r.created_at)}
              </div>
              <div className="record-card-meta">
                신고자 {r.reporter_name} <span className="mono-id">{r.reporter_student_id}</span>
                {r.accused_name && <> · 대상 {r.accused_name} <span className="mono-id">{r.accused_student_id}</span></>}
              </div>
              {r.memo && <div className="record-card-note">{r.memo}</div>}
              {r.admin_note && <div className="record-card-note text-muted">처리 메모: {r.admin_note}</div>}
              {r.status === 'pending' && (
                <div className="record-card-actions">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>처리</Button>
                </div>
              )}
            </li>
          ))}
          {reports.length === 0 && <li><EmptyState title="내역 없음" compact /></li>}
        </ul>
      )}

      {selected && (
        <ReportDetailModal report={selected} onClose={() => setSelected(null)} onReviewed={afterReview} />
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

function PenaltyListModal({ user, onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    reportApi.adminPenalties(user.id)
      .then(r => setRows(r.data))
      .catch(e => { setError(errMsg(e)); setRows([]) })
  }, [user.id])
  useEffect(() => { load() }, [load])

  const revoke = async (id) => {
    setBusy(true); setError('')
    try { await reportApi.adminRevoke(id); load(); onChanged() }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <Modal
      onClose={busy ? undefined : onClose}
      label="패널티 내역"
      title={<>패널티 내역 — {user.name} <span className="mono-id">{user.student_id}</span></>}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {rows === null ? <LoadingBox />
        : rows.length === 0 ? <EmptyState title="패널티 내역이 없습니다." compact /> : (
        <ul className="record-list">
          {rows.map(p => (
            <li key={p.id} className={`record-card${p.revoked_at ? ' is-suspended' : ''}`}>
              <div className="record-card-head">
                <strong>{p.level_label}</strong>
                {p.revoked_at
                  ? <StatusBadge tone="bad" label="취소됨" />
                  : <StatusBadge tone="wait" label="유효" />}
              </div>
              <div className="record-card-meta">
                {fmtDate(p.starts_at)}
                {p.ends_at && <> ~ {fmtDatetime(p.ends_at)}</>}
                {p.acknowledged_at && ' · 학생 확인함'}
              </div>
              <div className="record-card-note">{p.reason}</div>
              {!p.revoked_at && (
                <div className="record-card-actions">
                  <Button size="sm" variant="secondary" disabled={busy}
                    onClick={() => revoke(p.id)}>패널티 취소</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="ui-modal-actions">
        <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  )
}

/** 잠금이 풀릴 때까지 남은 분 (올림) — 0 이하면 이미 풀린 것 */
function lockMinutesLeft(lockedUntil) {
  if (!lockedUntil) return 0
  const left = parseUTC(lockedUntil).getTime() - Date.now()
  return left > 0 ? Math.ceil(left / 60000) : 0
}

/**
 * 발급된 임시 비밀번호를 보여주는 창.
 * 값은 서버가 한 번만 내려주므로(DB에는 해시만) 창을 닫으면 다시 볼 수 없다.
 */
function TempPasswordModal({ user, password, onClose }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // 클립보드를 못 쓰는 환경(비보안 출처 등) — 글자를 직접 고르게 둔다
      setCopied(false)
    }
  }

  return (
    <Modal title="임시 비밀번호를 발급했어요" onClose={onClose}>
      <p className="ui-modal-desc">
        {user.name}({user.student_id}) 학생의 임시 비밀번호입니다.
      </p>
      <div className="temp-password">
        <code className="temp-password-value">{password}</code>
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied
            ? <><IconDone size={ICON} aria-hidden="true" /> 복사됨</>
            : <><IconCopy size={ICON} aria-hidden="true" /> 복사</>}
        </Button>
      </div>
      <Notice tone="warning">
        이 창을 닫으면 다시 볼 수 없어요. 학생에게 직접 전달하세요.
      </Notice>
      <div className="ui-modal-actions">
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  )
}

const LOGIN_EVENT_LABELS = {
  USER_LOGIN: { label: '성공', tone: 'ok' },
  LOGIN_FAILED: { label: '실패', tone: 'bad' },
  LOGIN_LOCKED: { label: '잠김', tone: 'wait' },
}

/** 최근 로그인 성공·실패·잠금 기록 (GET /api/admin/users/{id}/login-events) */
function LoginEventsModal({ user, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminUserApi.loginEvents(user.id)
      .then(r => setRows(r.data))
      .catch(e => { setError(errMsg(e)); setRows([]) })
  }, [user.id])

  return (
    <Modal title={`${user.name} 로그인 기록`} onClose={onClose}>
      {error && <Notice tone="danger">{error}</Notice>}
      {rows === null ? <LoadingBox /> : rows.length === 0 ? (
        <EmptyState title="기록이 없습니다." compact />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>시각</th><th>결과</th><th>IP</th></tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const kind = LOGIN_EVENT_LABELS[e.action_type] || { label: e.action_type, tone: 'neutral' }
                return (
                  <tr key={e.id}>
                    <td>{fmtDatetime(e.created_at)}</td>
                    <td><StatusBadge tone={kind.tone} label={kind.label} /></td>
                    <td className="mono-id">{e.ip_address || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="ui-modal-actions">
        <Button variant="secondary" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [penaltyUser, setPenaltyUser] = useState(null)
  const [tempTarget, setTempTarget] = useState(null)   // 임시 비밀번호 발급 확인창 대상
  const [tempIssued, setTempIssued] = useState(null)   // { user, password } — 한 번만 보여준다
  const [tempBusy, setTempBusy] = useState(false)
  const [eventsUser, setEventsUser] = useState(null)
  const [resetting, setResetting] = useState(false)
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

  const resetCounter = async () => {
    try {
      await reportApi.adminResetCounter()
      setMsg('누적 횟수를 초기화했습니다'); setError(''); load()
    } catch (e) { setError(errMsg(e)) }
    finally { setResetting(false) }
  }

  const issueTemp = async () => {
    setTempBusy(true); setError('')
    try {
      const r = await adminUserApi.issueTempPassword(tempTarget.id)
      setTempIssued({ user: tempTarget, password: r.data.temp_password })
      setTempTarget(null); setMsg(''); load()
    } catch (e) { setError(errMsg(e)); setTempTarget(null) }
    finally { setTempBusy(false) }
  }

  const removeUser = async () => {
    setDeleteBusy(true); setDeleteError('')
    try {
      await adminUserApi.remove(deleting.id)
      setMsg(`${deleting.name}(${deleting.student_id}) 계정을 삭제했습니다`)
      setError(''); setDeleting(null); load()
    } catch (e) { setDeleteError(errMsg(e)) }
    finally { setDeleteBusy(false) }
  }

  return (
    <div>
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="filter-row">
        <Button variant="secondary" size="sm" onClick={() => setResetting(true)}>누적 초기화</Button>
      </div>

      <form className="filter-row" onSubmit={e => { e.preventDefault(); setSearch(q.trim()) }}>
        <TextField inline className="user-search" value={q} aria-label="사용자 검색"
          onChange={e => setQ(e.target.value)} placeholder="이름 · 학번 · 이메일 검색" />
        <Button type="submit" size="sm">
          <IconSearch size={ICON} aria-hidden="true" /> 검색
        </Button>
      </form>
      <FilterRow items={USER_FILTERS} value={filter} onChange={setFilter} label="사용자 상태 필터" />

      {loading ? <LoadingBox /> : (
        <ul className="record-list">
          {users.map(u => (
            <li key={u.id} className={`record-card${u.is_suspended ? ' is-suspended' : ''}`}>
              <div className="record-card-head">
                <div>
                  <strong>{u.name}</strong>{' '}
                  <span className="mono-id">{u.student_id}</span>
                </div>
                <div className="flex gap-2 wrap">
                  {u.role === 'admin' && <StatusBadge tone="brand" label="관리자" />}
                  {u.is_suspended && <StatusBadge tone="bad" label="정지" />}
                  {lockMinutesLeft(u.locked_until) > 0 && (
                    <StatusBadge tone="wait" label={`잠김 (${lockMinutesLeft(u.locked_until)}분)`} />
                  )}
                  {u.must_change_password && <StatusBadge tone="neutral" label="임시 비밀번호" />}
                  <StatusBadge tone={u.is_verified ? 'ok' : 'wait'}
                    label={u.is_verified ? '인증됨' : '미인증'} />
                </div>
              </div>
              <div className="record-card-meta">
                {u.email} · 예약 {u.reservation_count}건 · 가입 {fmtDatetime(u.created_at)}
              </div>
              <div className="record-card-meta">
                누적 패널티 <strong>{u.penalty_count}회</strong>
                {u.suspended_until && <> · 정지 해제 예정 {fmtDatetime(u.suspended_until)}</>}
              </div>
              {u.role !== 'admin' && (
                <div className="record-card-actions">
                  {u.is_suspended ? (
                    <Button size="sm" variant="secondary"
                      onClick={() => patch(u, { is_suspended: false }, '정지 해제됨')}>정지 해제</Button>
                  ) : (
                    <Button size="sm" variant="secondary"
                      onClick={() => patch(u, { is_suspended: true }, '정지됨')}>정지</Button>
                  )}
                  {u.is_verified && (
                    <Button size="sm" variant="secondary"
                      onClick={() => patch(u, { is_verified: false }, '인증 해제됨')}>인증 해제</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setPenaltyUser(u)}>패널티</Button>
                  <Button size="sm" variant="secondary" onClick={() => setTempTarget(u)}>
                    <IconPassword size={ICON} aria-hidden="true" /> 임시 비밀번호
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEventsUser(u)}>
                    <IconHistory size={ICON} aria-hidden="true" /> 로그인 기록
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => { setDeleteError(''); setDeleting(u) }}>삭제</Button>
                </div>
              )}
            </li>
          ))}
          {users.length === 0 && <li><EmptyState title="사용자 없음" compact /></li>}
        </ul>
      )}

      {resetting && (
        <ConfirmDialog
          title="누적 횟수를 초기화할까요?"
          description="모든 학생의 누적 횟수가 0이 됩니다. 기록은 남습니다."
          confirmLabel="초기화"
          tone="danger"
          onConfirm={resetCounter}
          onCancel={() => setResetting(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="계정 삭제"
          description={`이 계정과 관련 기록이 모두 삭제됩니다. 계속하려면 ${deleting.name} 학생의 학번을 입력하세요.`}
          confirmWord={deleting.student_id}
          confirmWordLabel={`학번 ${deleting.student_id} 입력`}
          confirmLabel="삭제"
          tone="danger"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={removeUser}
          onCancel={() => setDeleting(null)}
        />
      )}

      {penaltyUser && (
        <PenaltyListModal user={penaltyUser} onClose={() => setPenaltyUser(null)}
          onChanged={() => { setMsg('패널티를 취소했습니다'); setError(''); load() }} />
      )}

      {tempTarget && (
        <ConfirmDialog
          title="임시 비밀번호를 발급할까요?"
          description={`${tempTarget.name}(${tempTarget.student_id}) 학생의 모든 기기가 로그아웃돼요.`}
          confirmLabel="발급"
          tone="danger"
          busy={tempBusy}
          onConfirm={issueTemp}
          onCancel={() => setTempTarget(null)}
        />
      )}

      {tempIssued && (
        <TempPasswordModal user={tempIssued.user} password={tempIssued.password}
          onClose={() => setTempIssued(null)} />
      )}

      {eventsUser && (
        <LoginEventsModal user={eventsUser} onClose={() => setEventsUser(null)} />
      )}
    </div>
  )
}

// ── 메인 관리자 대시보드 ─────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('verifications')
  const [pendingCount, setPendingCount] = useState(0)
  const [op, setOp] = useState(null)
  const [pendingReports, setPendingReports] = useState(0)

  const loadPendingCount = useCallback(() => {
    verificationApi.adminList('pending')
      .then(r => setPendingCount(r.data.length))
      .catch(() => {})
  }, [])

  const loadPendingReports = useCallback(() => {
    reportApi.adminList('pending')
      .then(r => setPendingReports(r.data.length))
      .catch(() => {})
  }, [])

  useEffect(() => { loadPendingCount(); loadPendingReports() }, [loadPendingCount, loadPendingReports])
  useEffect(() => { operationApi.get().then(r => setOp(r.data)).catch(() => {}) }, [])

  const TABS = [
    { key: 'verifications', label: '인증', badge: pendingCount },
    { key: 'reports', label: '신고', badge: pendingReports },
    { key: 'users', label: '사용자' },
    { key: 'seats', label: '자리 관리' },
    { key: 'reservations', label: '예약/이용 로그' },
    { key: 'audit', label: '감사 로그' },
  ]

  return (
    <div>
      <PageTitle action={
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/qr-print')}>
          <IconPrint size={ICON} aria-hidden="true" /> QR 인쇄
        </Button>
      }>
        관리자 대시보드
      </PageTitle>

      <OperationModeCard op={op} onChanged={setOp} />

      <Tabs items={TABS} value={tab} onChange={setTab} label="관리 항목" />

      {tab === 'verifications' && <VerificationsTab onPendingCount={loadPendingCount} />}
      {tab === 'reports' && <ReportsTab onPendingCount={loadPendingReports} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'seats' && <SeatsTab />}
      {tab === 'reservations' && <ReservationsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}
