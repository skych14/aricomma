import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { operationApi, reservationApi } from '../../api/index.js'
import {
  Button, Card, LoadingBox, Notice, PageTitle, Spinner,
} from '../../components/ui/index.js'
import {
  IconBack, IconCameraOff, IconCelebrate, IconCheck, IconDone, IconExpired,
} from '../../components/ui/icons.jsx'
import { fmtTime, parseUTC } from '../../utils/helpers.js'

const SCANNER_ELEMENT_ID = 'checkin-qr-reader'

// 카메라를 쓸 수 없는 두 가지 경우 — 안내 문구가 다르다
const CAMERA_DENIED = 'denied'
const CAMERA_UNAVAILABLE = 'unavailable'

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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(true)   // 카메라 기동 중
  const [scanHit, setScanHit] = useState(false)    // 성공 피드백(초록 테두리)
  const [cameraError, setCameraError] = useState('')
  const [op, setOp] = useState(null)          // 체크인 전 예상 종료 시각 안내용
  const [usageEnd, setUsageEnd] = useState('') // 체크인 후 확정된 종료 시각

  // 스캐너 인스턴스와 "처리 중" 플래그는 ref로 — 콜백이 최신 state를 못 보므로
  const scannerRef = useRef(null)      // 지금 화면이 쓰고 있는 스캐너
  const genRef = useRef(0)             // 시작 요청 세대 — start/stop 때마다 증가
  const pendingStartRef = useRef(null) // 진행 중인 시작 절차 (카메라 이중 기동 방지)
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

  useEffect(() => {
    operationApi.get().then(r => setOp(r.data)).catch(() => {})
  }, [])

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
      const res = await reservationApi.checkin(rid, token)
      if (unmountedRef.current) return
      setUsageEnd(res.data?.usage_ends_at || '')
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
        retryTimerRef.current = setTimeout(() => { startScanner() }, 2000)
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
    if (!document.getElementById(SCANNER_ELEMENT_ID)) return

    // cameraError는 여기서 지우지 않는다. 시작이 "실제로 성공"했을 때만 지워야
    // StrictMode 이중 마운트에서 두 번째 시작이 첫 번째의 실패 안내를 지우지 않는다.
    setStarting(true)
    busyRef.current = false

    // 여기부터 pendingStartRef 대입까지는 동기 — 두 호출이 끼어들 틈이 없다
    const gen = ++genRef.current
    const inst = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
    scannerRef.current = inst

    // start()가 끝난 시점에 아직 이 인스턴스를 써야 하는지
    const stillWanted = () => (
      !unmountedRef.current && genRef.current === gen && scannerRef.current === inst
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
        // start()를 기다리는 사이에 언마운트됐거나 더 최신 요청이 생겼을 수 있다.
        // 그 경우 이 로컬 인스턴스를 직접 정지해야 카메라가 살아남지 않는다.
        if (!stillWanted()) {
          if (scannerRef.current === inst) scannerRef.current = null
          await hardStop(inst)
          return
        }
        setScanning(true)
        setStarting(false)
        setCameraError('')   // 실제로 켜졌을 때만 안내를 내린다
      } catch (e) {
        if (scannerRef.current === inst) scannerRef.current = null
        await hardStop(inst)
        // 이미 화면을 벗어났거나 더 최신 요청이 있으면 상태를 건드리지 않는다
        if (unmountedRef.current || genRef.current !== gen) return
        setScanning(false)
        setStarting(false)
        setCameraError(
          e?.name === 'NotAllowedError' || String(e).includes('NotAllowed')
            ? CAMERA_DENIED
            : CAMERA_UNAVAILABLE
        )
      }
    })()

    pendingStartRef.current = proc
    try { await proc } finally {
      if (pendingStartRef.current === proc) pendingStartRef.current = null
    }
  }, [doCheckin, stopScanner, hardStop])

  // 예약이 확인되면 카메라를 켠다
  useEffect(() => {
    if (loading || success) return
    if (!reservation || reservation.status !== 'pending') return
    startScanner()
  }, [loading, reservation, success, startScanner])

  if (loading) return <LoadingBox />

  if (!reservation) return (
    <Card elevated>
      <Notice tone="danger">예약을 찾을 수 없습니다.</Notice>
      <Button variant="secondary" onClick={() => navigate('/dashboard')}>대시보드로</Button>
    </Card>
  )

  if (success) return (
    <Card elevated className="checkin-result">
      <IconCelebrate size={48} className="checkin-result-icon" aria-hidden="true" />
      <h2 className="checkin-result-title">체크인 완료!</h2>
      <p className="text-muted">좌석 <span className="seat-no">{reservation.seat_number}</span> 이용이 시작되었습니다.</p>
      {usageEnd && (
        <p className="usage-end-line">이용 종료 예정 <strong>{fmtTime(usageEnd)}</strong></p>
      )}
      <p className="text-muted">잠시 후 대시보드로 이동합니다...</p>
    </Card>
  )

  if (reservation.status === 'checked_in') return (
    <Card elevated className="checkin-result">
      <IconDone size={48} className="checkin-result-icon" aria-hidden="true" />
      <h2 className="checkin-result-title">이미 체크인된 예약입니다</h2>
      <p className="text-muted">좌석 <span className="seat-no">{reservation.seat_number}</span> 이용 중</p>
      <Button onClick={() => navigate('/dashboard')}>대시보드로</Button>
    </Card>
  )

  if (['expired', 'cancelled', 'completed'].includes(reservation.status)) return (
    <Card elevated className="checkin-result">
      <IconExpired size={48} className="checkin-result-icon" aria-hidden="true" />
      <h2 className="checkin-result-title">유효하지 않은 예약입니다</h2>
      <p className="text-muted">다시 예약해주세요.</p>
      <Button onClick={() => navigate('/seats')}>좌석 예약하기</Button>
    </Card>
  )

  return (
    <div>
      <PageTitle>QR 체크인</PageTitle>

      <Card elevated>
        <div className="checkin-head">
          <div>
            <div className="section-title">예약 좌석: <span className="seat-no">{reservation.seat_number || '—'}</span></div>
            <div className="text-muted">{reservation.location} · 침대</div>
          </div>
          <div className="text-center">
            <div className="checkin-deadline-label">체크인 마감</div>
            <Countdown expiresAt={reservation.expires_at} />
          </div>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <p className="checkin-guide"><strong>현장 침대에 부착된 QR을 비춰주세요</strong></p>

        {op?.usage_ends_at_if_checkin_now && (
          <p className="usage-end-line">
            지금 체크인하면 <strong>{fmtTime(op.usage_ends_at_if_checkin_now)}</strong>까지 이용할 수 있어요
          </p>
        )}

        {/* 스캐너 엘리먼트는 항상 붙어 있어야 "다시 시도"가 같은 경로로 재시작할 수 있다 */}
        <div className={`scanner-frame${scanHit ? ' hit' : ''}`}>
          <div id={SCANNER_ELEMENT_ID} className="scanner-video" />
          {scanning && !scanHit && !cameraError && <div className="scanner-guide" />}
          {scanHit && (
            <div className="scanner-hit-mark">
              <IconCheck size={72} strokeWidth={3} aria-hidden="true" />
            </div>
          )}

          {!scanHit && starting && (
            <div className="scanner-placeholder">
              <Spinner /> 카메라 준비 중...
            </div>
          )}

          {!scanHit && !starting && cameraError && (
            <div className="scanner-error">
              <IconCameraOff size={32} aria-hidden="true" />
              <p className="scanner-error-title">카메라를 사용할 수 없어요</p>
              <p className="scanner-error-desc">
                {cameraError === CAMERA_DENIED
                  ? '브라우저 주소창의 자물쇠(ⓘ) 아이콘 → 카메라 → ‘허용’으로 바꾼 뒤 다시 시도해 주세요'
                  : '카메라가 있는 휴대폰으로 접속해 주세요'}
              </p>
              <Button size="sm" onClick={() => startScanner()}>다시 시도</Button>
              <p className="scanner-error-note">
                계속 안 되면 관리자에게 문의해 주세요. 체크인 마감 시간이 지나면 예약이 자동 취소됩니다.
              </p>
            </div>
          )}
        </div>

        {submitting && (
          <p className="checkin-submitting"><Spinner size="sm" /> 체크인 중...</p>
        )}

        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate('/dashboard')}>
          <IconBack size={16} aria-hidden="true" /> 대시보드로
        </Button>
      </Card>
    </div>
  )
}
