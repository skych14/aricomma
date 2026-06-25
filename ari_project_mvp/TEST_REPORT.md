# 아리쉼표 MVP 검수 보고서

검수일: 2026-06-24  
환경: GitHub Codespaces, Python 3.12.1, Node.js v24.14.0

---

## 검수 결과 요약

| # | 항목 | 결과 | 비고 |
|---|---|---|---|
| 1 | 백엔드 실행 가능 여부 | ✅ PASS | uvicorn, 포트 8000 |
| 2 | 프론트엔드 실행 가능 여부 | ✅ PASS | Vite 빌드 성공 (96 modules) |
| 3 | 회원가입/로그인 | ✅ PASS | JWT 발급, bcrypt 해시 저장 확인 |
| 4 | 학생 인증자료 제출 | ✅ PASS | 파일 업로드, Mock OCR, pending 상태 확인 |
| 5 | 관리자 승인/거절 | ✅ PASS | 승인 시 is_verified=True 자동 반영 |
| 6 | 승인 전 예약 차단 | ✅ PASS | "학생 인증이 완료되어야 예약할 수 있습니다" |
| 7 | 승인 후 예약 가능 | ✅ PASS | 승인 즉시 예약 성공, status=pending |
| 8 | 예약한 좌석 QR 토큰으로 체크인 성공 | ✅ PASS | status=checked_in 전환 확인 |
| 9 | 다른 좌석 QR 토큰으로 체크인 실패 | ✅ PASS | "예약하신 좌석의 QR이 아닙니다" |
| 10 | 예약 만료 후 체크인 실패 | ✅ PASS | "유효하지 않은 예약입니다" (status=expired) |
| 11 | 퇴실 처리 | ✅ PASS | status=completed, checked_out_at 기록 |
| 12 | audit log 기록 | ✅ PASS | USER_LOGIN, RESERVATION_CREATE, CHECKIN, CHECKOUT, RESERVATION_EXPIRED 확인 |
| 13 | README 실행 절차 | ✅ PASS | make setup + make dev / start-dev.sh 동작 |

---

## 세부 검증 내용

### 1. 백엔드 실행

```
GET /health → {"status":"ok"}
스케줄러: 예약 만료 스케줄러 시작 (1분 간격)
```

### 2. 프론트엔드 빌드

```
✓ 96 modules transformed
dist/assets/index-*.js   249.15 kB │ gzip: 80.60 kB
✓ built in 3.10s
```

### 3. 회원가입/로그인

- `POST /api/auth/register` → 201, hashed_password bcrypt 저장 확인
- `POST /api/auth/login` → JWT access_token 발급, 24시간 유효
- 중복 이메일/학번 시 400 에러 반환

### 4. 학생 인증자료 제출

- `POST /api/verifications` multipart/form-data
- Mock OCR: 파일명에서 이름/학번 추출 시도, 결과 JSON 저장
- UUID 기반 난독화 파일명으로 uploads/ 저장
- status=pending, created_at 기록

### 5. 관리자 승인/거절

- `PUT /api/admin/verifications/{id}` action=approve/reject
- 승인 시: verification.status=approved + user.is_verified=True 동시 반영
- 거절 시: verification.status=rejected, admin_note 저장

### 6~7. 예약 권한 제어

```
미인증 학생 예약 → 403: "학생 인증이 완료되어야 예약할 수 있습니다"
승인 후 즉시 예약 → 201: status=pending, expires_at=now+600s
```

### 8. QR 체크인 성공

```
POST /api/reservations/{id}/checkin {"qr_token": "<seat.qr_token>"}
→ 200: status=checked_in, checked_in_at 기록
usage_log: action=checked_in
audit_log: CHECKIN
```

**QR 체크인 설계 준수 확인:**
- QR 코드는 좌석/침대에 고정 부착 (seats.qr_token)
- 학생은 예약 후 현장에서 본인 좌석 QR 스캔
- 백엔드가 예약된 seat_id의 qr_token과 입력값 대조

### 9. 잘못된 QR 체크인 실패

```
입력: "wrong-qr-token-000"
→ 400: "예약하신 좌석의 QR이 아닙니다. 본인 좌석을 확인해 주세요"
```

### 10. 만료 후 체크인 실패

```
강제로 expires_at이 지난 예약 생성 후 체크인 시도
→ GET /api/reservations/me 호출 시 expire_pending_reservations() 실행
→ status=expired로 자동 전환
→ 체크인 시도: 410 "유효하지 않은 예약입니다"
```

예약 만료 보정 동작 확인:
- APScheduler: 1분 간격 자동 실행
- 요청 보정: 좌석 목록 조회 / 예약 생성 / 내 예약 목록 / 체크인 시점에 호출

### 11. 퇴실 처리

```
POST /api/reservations/{id}/checkout
→ status=completed, checked_out_at 기록
usage_log: action=checked_out
audit_log: CHECKOUT
```

### 12. Audit Log 확인

```
최근 5건:
  CHECKOUT              | actor: 테스트학생
  CHECKIN               | actor: 테스트학생
  RESERVATION_CREATE    | actor: 테스트학생
  VERIFICATION_APPROVE  | actor: 관리자
  USER_LOGIN            | actor: 관리자
```

RESERVATION_EXPIRED도 만료 테스트 시 기록 확인.

### 13. README 실행 절차

- `make setup` → pip install + npm install + seed.py 실행 확인
- `make dev` → start-dev.sh 실행, 백엔드+프론트엔드 동시 시작
- `.env.example` → `.env` 자동 복사 확인
- API 문서: http://localhost:8000/docs (Swagger UI)

---

## 보안 검증

| 항목 | 결과 |
|---|---|
| 비밀번호 bcrypt 해시 저장 | ✅ hashed_password 컬럼, passlib[bcrypt] |
| 평문 비밀번호 응답 포함 안 됨 | ✅ UserResponse에 hashed_password 없음 |
| 학생이 타인 예약 체크인 시도 | ✅ 403 "본인의 예약이 아닙니다" |
| 학생이 관리자 API 호출 시도 | ✅ 403 "관리자만 접근할 수 있습니다" |
| 인증자료 파일 직접 URL 접근 | ✅ 관리자 엔드포인트로만 제공 |
| JWT 만료 토큰 재사용 | ✅ 401 반환 |

---

## 알려진 제한사항 (1차 MVP 의도적 미구현)

| 항목 | 설명 |
|---|---|
| 신고/페널티/이의제기 | 2차 기능으로 분리 |
| QR 코드 이미지 PNG 생성 | 2차 기능 (qrcode 라이브러리 준비됨) |
| 실제 카메라 QR 스캔 | 2차 기능 (html5-qrcode, 백엔드 변경 없음) |
| 관리자 통계 대시보드 | 2차 기능 |
| 이메일 알림 | 미구현 |
| 비밀번호 찾기 | 미구현 |
