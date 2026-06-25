# 아리쉼표 (Ari-Shuimpyo) MVP 설계 문서

> 이 문서는 구현의 기준입니다. 구현 중 이 문서를 벗어나지 않습니다.
> 최종 합의일: 2026-06-24

---

## 서비스 개요

안양대학교 학우실(휴게/수면실)의 수기·자석 방식 좌석 관리를 디지털 예약 + 좌석 부착 QR 체크인 + 개인 책임제 이용 로그로 개선하는 서비스.

학교 SSO/학사 DB 미연동. 사설 계정 + 학생증 사진 업로드 + 관리자 수동 승인 방식.

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python 3.12) |
| Database | SQLite (DATABASE_URL 환경변수, PostgreSQL 전환 가능) |
| ORM | SQLAlchemy (sync) |
| 인증 | JWT (Access Token, 24시간) |
| 비밀번호 | bcrypt (passlib) |
| 스케줄러 | APScheduler |
| 파일 업로드 | 로컬 uploads/ 디렉토리, UUID 난독화 |

---

## 1차 MVP 범위

### 포함
- 회원가입 / 로그인 / JWT 인증
- 비밀번호 bcrypt 해시
- 학생 / 관리자 역할 분리
- 학생 인증자료 제출 + Mock OCR + 관리자 승인/거절
- 승인된 학생만 좌석 예약 가능
- 좌석 목록/현황 확인
- 관리자 좌석 CRUD + QR 토큰 확인
- 예약 생성 (1인 1좌석, 중복 예약 방지)
- 좌석 부착 QR 토큰 입력 방식 체크인 (카메라 교체 가능 구조)
- 퇴실 처리
- 예약 만료 (APScheduler + 요청 시점 보정)
- 기본 Audit Log
- Seed 데이터 (관리자 계정 + 테스트 좌석)
- README / .env.example / start-dev.sh / Makefile

### 2차 (1차 완성 후)
- 신고 / 페널티 / 이의제기
- QR 이미지 PNG 생성/다운로드
- 실제 카메라 QR 스캔 (html5-qrcode)
- 고급 관리자 통계

---

## QR 체크인 설계 (핵심)

**QR 코드는 학생에게 발급되지 않는다.**

```
[현실]  침대/좌석 ──── 물리 QR 스티커 부착 ──→ seats.qr_token (고정 UUID)
[MVP]   학생이 예약 후 현장에서 해당 좌석 QR을 "스캔" (1차: 토큰 직접 입력)
[확장]  html5-qrcode 라이브러리로 카메라 스캔 교체 (백엔드 변경 없음)
```

### 체크인 검증 순서
1. 로그인한 학생 본인의 예약인지 (`reservation.user_id == current_user.id`)
2. 예약 상태가 `pending`인지
3. 만료 시간이 지나지 않았는지 (`expires_at > now`)
4. 스캔한 `qr_token`이 예약된 좌석의 `qr_token`과 일치하는지

### 실패 케이스별 응답
| 상황 | HTTP | 메시지 |
|---|---|---|
| 다른 좌석 QR | 400 | 예약하신 좌석의 QR이 아닙니다 |
| 본인 예약 아님 | 403 | 본인의 예약이 아닙니다 |
| 만료 후 스캔 | 410 | 예약이 만료되었습니다. 재예약 후 이용하세요 |
| 이미 체크인 | 409 | 이미 체크인된 예약입니다 |
| 취소/만료 상태 | 410 | 유효하지 않은 예약입니다 |

---

## 예약 만료 설계

- `RESERVATION_EXPIRY_SECONDS` 환경변수 (기본 600초 = 10분)
- APScheduler: 1분마다 `expire_pending_reservations()` 실행
- 추가 보정: 좌석 목록 조회 / 예약 생성 / 체크인 시점에도 동일 함수 호출
- 만료 시 `usage_logs` + `audit_logs` 자동 기록

---

## 예약 동시성 설계

- 예약 생성/체크인/퇴실은 단일 DB 트랜잭션 내 처리
- 같은 좌석에 `pending` 또는 `checked_in` 예약 존재 시 신규 예약 실패
- 한 학생이 동시에 여러 좌석 예약 불가 (활성 예약 1개 제한)
- SQLAlchemy 기반 구현 (PostgreSQL 전환 용이)

---

## DB 스키마

### users
```
id            UUID PK
email         TEXT UNIQUE NOT NULL
hashed_password TEXT NOT NULL
name          TEXT NOT NULL
student_id    TEXT UNIQUE NOT NULL
role          TEXT NOT NULL  -- 'student' | 'admin'
is_verified   BOOL DEFAULT FALSE
is_suspended  BOOL DEFAULT FALSE
created_at    DATETIME
updated_at    DATETIME
```

### verification_requests
```
id            UUID PK
user_id       UUID FK→users NOT NULL
file_path     TEXT NOT NULL  -- UUID 난독화 경로
ocr_result    TEXT           -- JSON 문자열
status        TEXT DEFAULT 'pending'  -- pending|approved|rejected
admin_note    TEXT
reviewed_by   UUID FK→users  -- 처리한 관리자
reviewed_at   DATETIME
created_at    DATETIME
```

### seats
```
id            UUID PK
seat_number   TEXT UNIQUE NOT NULL  -- 'A01', 'B03'
seat_type     TEXT NOT NULL         -- 'chair' | 'bed'
location      TEXT NOT NULL         -- '1층 좌측'
qr_token      TEXT UNIQUE NOT NULL  -- 현장 부착 QR 값 (UUID)
is_active     BOOL DEFAULT TRUE
created_at    DATETIME
updated_at    DATETIME
```

### reservations
```
id            UUID PK
user_id       UUID FK→users NOT NULL
seat_id       UUID FK→seats NOT NULL
status        TEXT DEFAULT 'pending'
              -- pending|checked_in|completed|expired|cancelled
reserved_at   DATETIME NOT NULL
expires_at    DATETIME NOT NULL  -- reserved_at + EXPIRY_SECONDS
checked_in_at DATETIME
checked_out_at DATETIME
```

### usage_logs
```
id            UUID PK
reservation_id UUID FK→reservations NOT NULL
user_id       UUID FK→users NOT NULL
seat_id       UUID FK→seats NOT NULL
action        TEXT NOT NULL
              -- reserved|checked_in|checked_out|expired|cancelled
performed_at  DATETIME NOT NULL
note          TEXT
```

### audit_logs
```
id            UUID PK
actor_id      UUID FK→users  -- nullable (시스템 행위)
action_type   TEXT NOT NULL  -- USER_LOGIN, RESERVATION_CREATE, CHECKIN ...
target_type   TEXT
target_id     UUID
detail        TEXT           -- JSON
ip_address    TEXT
created_at    DATETIME
```

---

## API 설계 요약

### 인증
| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | /api/auth/register | 누구나 |
| POST | /api/auth/login | 누구나 |
| GET | /api/auth/me | 로그인 |

### 인증자료
| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | /api/verifications | student |
| GET | /api/verifications/me | student |
| GET | /api/admin/verifications | admin |
| GET | /api/admin/verifications/{id} | admin |
| PUT | /api/admin/verifications/{id} | admin |
| GET | /api/admin/verifications/{id}/file | admin |

### 좌석
| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | /api/seats | 로그인 |
| POST | /api/admin/seats | admin |
| PUT | /api/admin/seats/{id} | admin |
| DELETE | /api/admin/seats/{id} | admin |

### 예약
| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | /api/reservations | student (인증+활성) |
| GET | /api/reservations/me | student |
| DELETE | /api/reservations/{id} | student (본인) |
| POST | /api/reservations/{id}/checkin | student (본인) |
| POST | /api/reservations/{id}/checkout | student (본인) |
| GET | /api/admin/reservations | admin |

### 이용 로그 / 감사 로그
| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | /api/usage-logs/me | student |
| GET | /api/admin/usage-logs | admin |
| GET | /api/admin/audit-logs | admin |

---

## 권한/보안 설계

- JWT Bearer Token, Authorization 헤더 방식
- `get_current_user` → `get_current_student` → `get_verified_student` → `get_active_student` 의존성 체인
- 학생: 본인 user_id 기준 필터 강제
- 관리자: `/api/admin/` 네임스페이스로 분리
- 인증자료 파일: 직접 정적 서빙 차단, 관리자 API 통해서만 스트리밍
- bcrypt 해시, 평문 저장/로그 금지

---

## 프론트엔드 화면 구성

### 학생
- `/login`, `/register`
- `/dashboard` — 인증 상태, 활성 예약 카드
- `/verify` — 인증자료 제출/상태 확인
- `/seats` — 좌석 현황 그리드
- `/checkin/:reservationId` — QR 토큰 입력 체크인

### 관리자
- `/admin` — 단일 대시보드 (4탭)
  1. 인증 요청
  2. 좌석 관리 + QR 토큰
  3. 예약/이용 로그
  4. 감사 로그

---

## 구현 순서

1. DESIGN.md (현재 문서)
2. 백엔드 기반 (config, database, models, utils/auth)
3. 백엔드 라우터 (auth → verifications → seats → reservations → logs)
4. scheduler + seed + main.py
5. 프론트엔드 기반 (vite setup, api client, auth context)
6. 프론트엔드 학생 화면
7. 프론트엔드 관리자 화면
8. 실행 스크립트 + README
9. TEST_REPORT.md
