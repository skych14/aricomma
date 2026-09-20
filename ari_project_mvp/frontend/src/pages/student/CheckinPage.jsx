import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { reservationApi } from '../../api/index.js'
import { parseUTC } from '../../utils/helpers.js'

const SCANNER_ELEMENT_ID = 'checkin-qr-reader'

function Countdown({ expiresAt }) {
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((parseUTC(expiresAt) - Date.now()) / 1000))
      setSecs(diff)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  const min = String(Math.floor(secs / 60)).padStart(2, '0')
  const sec = String(secs % 60).padStart(2, '0')
  return <div className={`timer ${secs > 60 ? 'ok' : ''}`}>{min}:{sec}</div>
}

export default function CheckinPage() {
  const { rid } = useParams()
  const navigate = useNavigate()
  const [reservation, setReservation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qrToken, setQrToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 'scan' = 카메라 스캔, 'manual' = 직접 입력
  const [mode, setMode] = useState('scan')
  const [scanning, setScanning] = useState(false)
  const [scanHit, setScanHit] = useState(false)   // 성공 피드백(초록 테두리)
  const [cameraError, setCameraError] = useState('')
  const inputRef = useRef()

  // 스캐너 인스턴스와 "처리 중" 플래그는 ref로 — 콜백이 최신 state를 못 보므로
  const scannerRef = useRef(null)      // 지금 화면이 쓰고 있는 스캐너
  const genRef = useRef(0)             // 시작 요청 세대 — start/stop 때마다 증가
  const pendingStartRef = useRef(null) // 진행 중인 시작 절차 (카메라 이중 기동 방지)
  const modeRef = useRef('scan')       // 비동기 콜백이 읽을 최신 mode
  const busyRef = useRef(false)        // API 호출 중이면 중복 스캔 무시
  const unmountedRef = useRef(false)
  const retryTimerRef = useRef(null)

  // ── 인스턴스 강제 정지 ────────────────────────────────────────────────
  // start()가 아직 끝나지 않아 SCANNING이 아닌 인스턴스도 안전하게 처리한다.
  // stop()이 먹지 않는 시점이면 video에 붙은 트랙을 직접 끊어 카메라를 확실히 끈다.
  const hardStop = useCallback(async (inst) => {
    if (inst) {
      try {
        // Html5QrcodeScannerState: 2 = SCANNING, 3 = PAUSED
        const st = inst.getState ? inst.getState() : 2
        if (st === 2 || st === 3) await inst.stop()
      } catch { /* 이미 정지됨 / 아직 시작 전 */ }
    }
    // clear()가 엘리먼트를 비우기 전에 남아 있는 트랙을 먼저 끊는다
    const host = document.getElementById(SCANNER_ELEMENT_ID)
    if (host) {
      host.querySelectorAll('video').forEach(v => {
        const stream = v.srcObject
        if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop())
        v.srcObject = null
      })
    }
    if (inst) { try { inst.clear() } catch { /* noop */ } }
  }, [])

  // ── 스캐너 정지 ───────────────────────────────────────────────────────
  // 세대를 올려 진행 중인 start()에게 "이 인스턴스는 버려라"라고 알린다.
  // 아직 시작 중이라 여기서 못 끄더라도, start()가 끝나는 쪽에서 스스로 정리한다.
  const stopScanner = useCallback(async () => {
    genRef.current += 1
    const inst = scannerRef.current
    scannerRef.current = null
    await hardStop(inst)
  }, [hardStop])

  // 언마운트 플래그. StrictMode의 개발 모드 이중 마운트에서 두 번째 마운트가
  // 첫 번째의 언마운트 플래그를 물려받지 않도록 스캔 effect보다 먼저 선언한다.
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      stopScanner()
    }
  }, [stopScanner])

  // mode 미러 — 아래 effect들과 비동기 콜백이 최신 값을 본다
  useEffect(() => { modeRef.current = mode }, [mode])

  useEffect(() => {
    reservationApi.myList()
      .then(r => {
        const found = r.data.find(x => x.id === rid)
        setReservation(found || null)
      })
      .catch(() => setReservation(null))
      .finally(() => setLoading(false))
  }, [rid])

  const doCheckin = useCallback(async (token) => {
    setSubmitting(true)
    setError('')
    try {
      await reservationApi.checkin(rid, token)
      if (unmountedRef.current) return
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      if (unmountedRef.current) return
      const status = err.response?.status
      setError(err.response?.data?.detail || '체크인에 실패했습니다')
      setScanHit(false)
      if (status === 410) {
        setTimeout(() => navigate('/seats'), 3000)
      } else if (status === 409) {
        // 이미 체크인된 예약 → 상태별 분기 화면으로
        setReservation(prev => (prev ? { ...prev, status: 'checked_in' } : prev))
      } else {
        // 다른 좌석 QR(400) 등 — 2초 뒤 스캔 재시작
        busyRef.current = false
        if (modeRef.current === 'scan') {
          retryTimerRef.current = setTimeout(() => { startScanner() }, 2000)
        }
        return
      }
    } finally {
      if (!unmountedRef.current) setSubmitting(false)
    }
  }, [rid, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 스캐너 시작 ────────────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    // 앞선 시작 절차가 끝날 때까지 기다린다 — 카메라가 두 번 켜지지 않도록
    if (pendingStartRef.current) { try { await pendingStartRef.current } catch { /* noop */ } }
    if (unmountedRef.current || scannerRef.current) return
    if (modeRef.current !== 'scan') return
    if (!document.getElementById(SCANNER_ELEMENT_ID)) return

    setCameraError('')
    busyRef.current = false

    // 여기부터 pendingStartRef 대입까지는 동기 — 두 호출이 끼어들 틈이 없다
    const gen = ++genRef.current
    const inst = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
    scannerRef.current = inst

    // start()가 끝난 시점에 아직 이 인스턴스를 써야 하는지
    const stillWanted = () => (
      !unmountedRef.current && modeRef.current === 'scan' &&
      genRef.current === gen && scannerRef.current === inst
    )

    // 정리까지 포함한 절차 전체를 하나의 프라미스로 — 다음 start는 이게 끝난 뒤 시작
    const proc = (async () => {
      try {
        await inst.start(
          // iOS Safari / Android Chrome 모두 후면 카메라를 잡는 권장 설정
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (vw, vh) => {
              const edge = Math.floor(Math.min(vw, vh) * 0.72)
              return { width: edge, height: edge }
            },
            aspectRatio: 1,
          },
          (decodedText) => {
            // 같은 QR이 연속으로 읽혀도 API는 한 번만
            if (busyRef.current) return
            busyRef.current = true
            const token = (decodedText || '').trim()
            setScanHit(true)
            // 호출 직후 카메라 정지
            stopScanner().finally(() => {
              setScanning(false)
              doCheckin(token)
            })
          },
          () => { /* 프레임마다 실패 콜백 — 무시 */ }
        )
        // start()를 기다리는 사이에 언마운트됐거나 직접 입력으로 넘어갔을 수 있다.
        // 그 경우 이 로컬 인스턴스를 직접 정지해야 카메라가 살아남지 않는다.
        if (!stillWanted()) {
          if (scannerRef.current === inst) scannerRef.current = null
          await hardStop(inst)
          return
        }
        setScanning(true)
      } catch (e) {
        if (scannerRef.current === inst) scannerRef.current = null
        await hardStop(inst)
        // 이미 화면을 벗어났다면 상태를 건드리지 않는다
        if (unmountedRef.current || genRef.current !== gen) return
        setScanning(false)
        // 권한 거부 / 카메라 없음 / 시작 실패 → 수동 입력으로 전환
        setCameraError(
          e?.name === 'NotAllowedError' || String(e).includes('NotAllowed')
            ? '카메라 권한이 거부되었습니다'
            : '카메라를 시작할 수 없습니다'
        )
        setMode('manual')
      }
    })()

    pendingStartRef.current = proc
    try { await proc } finally {
      if (pendingStartRef.current === proc) pendingStartRef.current = null
    }
  }, [doCheckin, stopScanner, hardStop])

  // 스캔 모드 진입 시 자동 시작, 벗어나면 정지
  useEffect(() => {
    if (loading || success) return
    if (!reservation || reservation.status !== 'pending') return
    if (mode !== 'scan') { stopScanner(); setScanning(false); return }
    startScanner()
  }, [mode, loading, reservation, success, startScanner, stopScanner])

  const switchToManual = () => {
    setMode('manual')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const switchToScan = () => {
    setError('')
    setScanHit(false)
    setMode('scan')
  }

  const submitManual = async (e) => {
    e.preventDefault()
    if (!qrToken.trim()) { setError('QR 토큰을 입력해주세요'); return }
    if (busyRef.current) return
    busyRef.current = true
    await doCheckin(qrToken.trim())
    busyRef.current = false
  }

  if (loading) return <div className="loading-box"><span className="spinner" /></div>

  if (!reservation) return (
    <div className="card">
      <div className="alert alert-error">예약을 찾을 수 없습니다.</div>
      <button className="btn btn-outline mt-4" onClick={() => navigate('/dashboard')}>대시보드로</button>
    </div>
  )

  if (success) return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
      <h2>체크인 완료!</h2>
      <p className="text-muted mt-2">좌석 <span className="seat-no">{reservation.seat_number}</span> 이용이 시작되었습니다.</p>
      <p className="text-muted">잠시 후 대시보드로 이동합니다...</p>
    </div>
  )

  if (reservation.status === 'checked_in') return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem' }}>✅</div>
      <h2 style={{ margin: '12px 0' }}>이미 체크인된 예약입니다</h2>
      <p className="text-muted">좌석 <span className="seat-no">{reservation.seat_number}</span> 이용 중</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/dashboard')}>대시보드로</button>
    </div>
  )

  if (['expired', 'cancelled', 'completed'].includes(reservation.status)) return (
    <div className="card text-center">
      <div style={{ fontSize: '3rem' }}>⏰</div>
      <h2 style={{ margin: '12px 0' }}>유효하지 않은 예약입니다</h2>
      <p className="text-muted">다시 예약해주세요.</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/seats')}>좌석 예약하기</button>
    </div>
  )

  return (
    <div>
      <h1 className="page-title">QR 체크인</h1>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
          <div>
            <div className="section-title">예약 좌석: <span className="seat-no">{reservation.seat_number || '—'}</span></div>
            <div className="text-muted">{reservation.location} · 침대</div>
          </div>
          <div className="text-center">
            <div className="text-muted" style={{ fontSize: '.82rem' }}>체크인 마감</div>
            <Countdown expiresAt={reservation.expires_at} />
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {mode === 'scan' ? (
          <div>
            <p className="text-muted text-center" style={{ fontSize: '.92rem', marginBottom: 10 }}>
              <strong>현장 침대에 부착된 QR을 비춰주세요</strong>
            </p>

            <div className={`scanner-frame${scanHit ? ' hit' : ''}`}>
              <div id={SCANNER_ELEMENT_ID} className="scanner-video" />
              {!scanHit && <div className="scanner-guide" />}
              {scanHit && <div className="scanner-hit-mark">✓</div>}
              {!scanning && !scanHit && (
                <div className="scanner-placeholder">
                  <span className="spinner" /> 카메라 준비 중...
                </div>
              )}
            </div>

            {submitting && (
              <div className="text-center text-muted mt-2" style={{ fontSize: '.88rem' }}>
                <span className="spinner" /> 체크인 중...
              </div>
            )}

            <div className="text-center mt-4">
              <button type="button" className="btn btn-ghost btn-sm" onClick={switchToManual}>
                직접 입력하기
              </button>
            </div>
          </div>
        ) : (
          <div className="qr-box">
            <div className="qr-icon">⌨️</div>
            {cameraError ? (
              <>
                <p><strong>카메라를 사용할 수 없어요</strong></p>
                <p className="form-hint" style={{ marginBottom: 12 }}>
                  브라우저 주소창의 자물쇠(ⓘ) 아이콘 → 카메라 → ‘허용’으로 바꾼 뒤 새로고침해 주세요.
                </p>
              </>
            ) : (
              <p><strong>좌석 QR 아래 문자열을 직접 입력하세요</strong></p>
            )}
            <form onSubmit={submitManual}>
              <div className="form-group">
                <input
                  ref={inputRef}
                  className="form-input"
                  value={qrToken}
                  onChange={e => setQrToken(e.target.value)}
                  placeholder="좌석에 부착된 QR 토큰 입력 (예: uuid 형식)"
                  style={{ fontFamily: 'monospace', fontSize: '.85rem' }}
                />
              </div>
              <button className="btn btn-success btn-block" disabled={submitting}>
                {submitting ? <><span className="spinner" /> 체크인 중...</> : '체크인'}
              </button>
            </form>
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={switchToScan}>
              카메라로 스캔하기
            </button>
          </div>
        )}

        <button className="btn btn-ghost btn-sm mt-4" onClick={() => navigate('/dashboard')}>
          ← 대시보드로
        </button>
      </div>
    </div>
  )
}
