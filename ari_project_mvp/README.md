# 🛏️ 아리쉼표 (Ari-Shuimpyo)

**안양대학교 학우실 예약 · QR 체크인 서비스 MVP**

수기·자석 방식 좌석 관리를 디지털 예약 + 현장 QR 체크인 + 개인 책임 이용 로그로 개선합니다.

---

## 빠른 시작 (GitHub Codespaces)

```bash
# 1. 프로젝트 디렉토리 이동
cd /workspaces/test/ari_project_mvp

# 2. 한 번에 설정 + 실행
make setup   # 의존성 설치 + 환경변수 파일 생성 + seed 데이터
make dev     # 백엔드(8000) + 프론트엔드(5173) 동시 실행
```

또는 스크립트로:
```bash
bash start-dev.sh
```

---

## 개별 실행

### 백엔드
```bash
cd backend
cp .env.example .env      # 처음 한 번만
pip install -r requirements.txt
python seed.py            # 초기 데이터 생성
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 프론트엔드
```bash
cd frontend
cp .env.example .env      # 처음 한 번만
npm install
npm run dev               # http://localhost:5173
```

---

## 테스트 계정

| 역할 | 이메일 | 비밀번호 | 상태 |
|---|---|---|---|
| 관리자 | admin@ari.ac.kr | admin1234 | — |
| 학생 (인증 완료) | student@ari.ac.kr | student1234 | 예약 가능 |
| 학생 (미인증) | student2@ari.ac.kr | student1234 | 예약 불가 |

---

## 주요 시연 시나리오

### 시나리오 1: 신규 학생 등록 → 인증 → 예약 → 체크인 → 퇴실

1. `/register` — 회원가입 (이름, 학번, 이메일, 비밀번호)
2. `/login` — 로그인
3. `/verify` — 학생증 사진 업로드
4. 관리자 로그인 → `/admin` → 인증 요청 탭 → 파일 확인 후 승인
5. 학생으로 로그인 → `/seats` — 좌석 클릭하여 예약
6. `/checkin/{id}` — **현장 침대/좌석에 붙은 QR 스캔** (MVP: 토큰 직접 입력)
   - 관리자 화면 > 좌석 관리 탭에서 해당 좌석 QR 토큰 확인 후 입력
7. 대시보드 → 퇴실하기

### 시나리오 2: 미인증 학생 예약 차단

1. `student2@ari.ac.kr` 로그인
2. 좌석 클릭 → "학생 인증이 완료되어야 예약할 수 있습니다" 오류

### 시나리오 3: 잘못된 QR 체크인 차단

1. 예약 후 체크인 화면에서 **다른 좌석의 QR 토큰** 입력
2. "예약하신 좌석의 QR이 아닙니다" 오류

---

## QR 체크인 방식

> **QR 코드는 학생에게 발급되지 않습니다.**
>
> 각 침대/좌석에 **고정 QR 코드가 물리적으로 부착**되어 있고,
> 학생은 예약 후 실제 학우실 현장에 도착하여 **본인이 예약한 침대/좌석의 QR을 스캔**해야 체크인됩니다.

- **운영 방법:** 관리자 화면 > 좌석 관리에서 각 좌석의 `qr_token`을 확인하고, QR 코드 이미지로 변환하여 출력 후 해당 침대/좌석에 부착
- **1차 MVP:** 카메라 스캔 대신 QR 토큰 직접 입력으로 시뮬레이션
- **확장:** `html5-qrcode` 라이브러리 추가 시 카메라 스캔으로 교체 가능 (백엔드 변경 없음)

---

## 환경 변수

### backend/.env

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./ari_project.db` | DB 연결 문자열 |
| `SECRET_KEY` | (변경 필요) | JWT 서명 키 |
| `UPLOAD_DIR` | `./uploads` | 인증자료 업로드 경로 |
| `CORS_ORIGINS` | `http://localhost:5173` | CORS 허용 오리진 |
| `RESERVATION_EXPIRY_SECONDS` | `600` | 예약 만료 시간 (개발용 단축 가능) |
| `ADMIN_EMAIL` | `admin@ari.ac.kr` | 초기 관리자 이메일 |
| `ADMIN_PASSWORD` | `admin1234` | 초기 관리자 비밀번호 |

### frontend/.env

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | 백엔드 API URL |

---

## PostgreSQL 전환 방법

SQLite는 MVP/파일럿 용도입니다. 상시 서비스 운영 시 PostgreSQL을 권장합니다.

```bash
# 1. psycopg2 설치
pip install psycopg2-binary

# 2. backend/.env 수정
DATABASE_URL=postgresql://user:password@host:5432/ari_db

# 3. 서버 재시작 (테이블은 자동 생성)
uvicorn main:app --reload
```

SQLAlchemy ORM 기반으로 작성되어 DB 코드 변경 없이 전환됩니다.

---

## 프로젝트 구조

```
ari_project_mvp/
├── backend/
│   ├── main.py          # FastAPI 앱 진입점
│   ├── config.py        # 환경변수 설정
│   ├── database.py      # SQLAlchemy 엔진/세션
│   ├── models/          # DB 모델 (SQLAlchemy)
│   ├── schemas/         # API 스키마 (Pydantic)
│   ├── routers/         # API 라우터
│   ├── utils/           # auth, audit, mock_ocr, expiry
│   ├── scheduler.py     # 예약 만료 스케줄러
│   ├── seed.py          # 초기 데이터 생성
│   └── uploads/         # 인증자료 업로드 (git 제외)
├── frontend/
│   └── src/
│       ├── api/         # axios API 클라이언트
│       ├── contexts/    # AuthContext
│       ├── components/  # Layout, ProtectedRoute
│       └── pages/       # 학생/관리자 화면
├── start-dev.sh
├── Makefile
└── DESIGN.md            # 설계 기준 문서
```

---

## 개인정보 및 인증자료 운영 주의사항

- 인증자료 파일(학생증 사진 등)은 `backend/uploads/` 에 UUID 난독화 이름으로 저장됩니다
- 파일 직접 접근은 차단되며, 관리자 API를 통해서만 열람 가능합니다
- **보관 기간:** 운영 정책에 따라 승인/거절 후 일정 기간 내 삭제를 권장합니다
- **삭제 요청:** 학생 요청 시 관리자가 uploads/ 폴더에서 해당 파일 삭제 및 DB 레코드 처리
- **실제 상시 서비스 전:** 개인정보처리방침 공고, 정보주체 동의 수집, 관련 법령 검토 필요
- **관리자 접근 제한:** 관리자 계정은 최소 인원으로 제한하고 비밀번호를 강하게 설정하세요

---

## 2차 기능 (향후 구현)

- [ ] 신고 (학생 → 관리자)
- [ ] 페널티 (경고/정지) 관리자 적용
- [ ] 이의제기 제출 및 처리
- [ ] QR 이미지 PNG 생성/다운로드 (qrcode 라이브러리)
- [ ] 실제 카메라 QR 스캔 (html5-qrcode)
- [ ] 관리자 통계 대시보드 (일별 예약 수, 이용률 등)
- [ ] 예약 만료 푸시 알림

---

## API 문서

백엔드 실행 후 아래 URL에서 Swagger 문서를 확인할 수 있습니다:
- http://localhost:8000/docs
- http://localhost:8000/redoc
