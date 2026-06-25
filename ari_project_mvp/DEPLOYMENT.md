# 아리쉼표 배포 가이드

배포 전략: **Frontend → Cloudflare Pages / Backend → Fly.io**

```
[사용자]
   │
   ├──→ Cloudflare Pages (React SPA, CDN 배포)
   │         │
   │         └──→ HTTPS API 요청
   │
   └──→ Fly.io (FastAPI + SQLite + uploads)
             │
             └──→ /data 볼륨 (SQLite DB + 인증자료 파일)
```

---

## 사전 준비

```bash
# Fly.io CLI 설치
curl -L https://fly.io/install.sh | sh

# Fly.io 로그인
fly auth login

# Cloudflare 계정: https://pages.cloudflare.com (웹 UI 사용)
```

---

## 1단계: Fly.io — 백엔드 배포

### 1-1. 앱 생성

```bash
cd /workspaces/test/ari_project_mvp/backend

# 앱 이름은 전 세계 고유해야 함 (예: ari-project-mvp-YOUR_NAME)
fly apps create ari-project-mvp
```

> `fly.toml`의 `app = "ari-project-mvp"` 값을 실제 생성된 앱 이름으로 변경하세요.

### 1-2. 영구 볼륨 생성

SQLite DB 파일과 인증자료 업로드 파일을 저장하는 볼륨입니다.

```bash
# nrt = 도쿄 (한국에서 가장 가까운 리전)
# --size 1 = 1GB (파일럿 용도로 충분)
fly volumes create ari_data --region nrt --size 1 --app ari-project-mvp
```

볼륨 확인:
```bash
fly volumes list --app ari-project-mvp
```

### 1-3. 시크릿 설정

민감한 환경변수는 `fly secrets set`으로 설정합니다 (fly.toml에 넣지 않음).

```bash
# SECRET_KEY: 반드시 긴 랜덤 문자열 사용
fly secrets set SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
  --app ari-project-mvp

# 초기 관리자 계정 (배포 후 seed 실행 전 설정)
fly secrets set ADMIN_EMAIL="admin@ari.ac.kr" \
  ADMIN_PASSWORD="여기에강한비밀번호입력" \
  ADMIN_NAME="관리자" \
  --app ari-project-mvp
```

### 1-4. CORS 설정 (Cloudflare Pages 도메인 추가)

Cloudflare Pages 배포 후 생성된 도메인으로 업데이트합니다.

```bash
# Pages 도메인 확인 후 실행 (예: https://ari-project-mvp.pages.dev)
fly secrets set \
  CORS_ORIGINS="https://ari-project-mvp.pages.dev,http://localhost:5173" \
  --app ari-project-mvp
```

또는 `fly.toml`의 `[env]` 섹션에서 수정 후 재배포:
```toml
[env]
  CORS_ORIGINS = "https://ari-project-mvp.pages.dev,http://localhost:5173"
```

### 1-5. 배포

```bash
cd /workspaces/test/ari_project_mvp/backend
fly deploy --app ari-project-mvp
```

배포 로그 확인:
```bash
fly logs --app ari-project-mvp
```

### 1-6. Seed 데이터 생성

```bash
# 배포된 컨테이너에서 seed.py 실행
fly ssh console --app ari-project-mvp
# 컨테이너 내부에서:
cd /app && python seed.py
exit
```

또는 원격 실행:
```bash
fly ssh console --app ari-project-mvp --command "python /app/seed.py"
```

### 1-7. 백엔드 URL 확인

```bash
fly status --app ari-project-mvp
# Hostname: ari-project-mvp.fly.dev
```

헬스 체크:
```bash
curl https://ari-project-mvp.fly.dev/health
# {"status":"ok"}
```

---

## 2단계: Cloudflare Pages — 프론트엔드 배포

### 방법 A: Git 연동 (권장)

1. 코드를 GitHub 레포지토리에 Push
2. [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
3. GitHub 레포 연결
4. 빌드 설정:

| 항목 | 값 |
|---|---|
| Framework preset | None (또는 Vite) |
| Build command | `cd frontend && npm install && npm run build` |
| Build output directory | `frontend/dist` |
| Root directory | `/` (레포 루트) |

5. **환경변수 설정** (중요):

| 변수명 | 값 |
|---|---|
| `VITE_API_URL` | `https://ari-project-mvp.fly.dev` |

6. Save and Deploy

### 방법 B: 직접 업로드 (Git 없이 빠른 배포)

```bash
# 빌드
cd /workspaces/test/ari_project_mvp/frontend
VITE_API_URL=https://ari-project-mvp.fly.dev npm run build

# Wrangler CLI로 업로드
npm install -g wrangler
wrangler pages deploy dist --project-name ari-project-mvp
```

### 방법 C: Cloudflare Pages CLI (wrangler)

```bash
cd /workspaces/test/ari_project_mvp/frontend
npx wrangler pages project create ari-project-mvp
VITE_API_URL=https://ari-project-mvp.fly.dev npm run build
npx wrangler pages deploy dist --project-name ari-project-mvp
```

---

## 3단계: 배포 후 테스트

### 헬스 체크

```bash
# 백엔드
curl https://ari-project-mvp.fly.dev/health

# 프론트엔드 (브라우저에서)
open https://ari-project-mvp.pages.dev
```

### 기능 테스트 시나리오

```
1. 회원가입 + 로그인
   → https://ari-project-mvp.pages.dev/register

2. 학생 인증자료 제출
   → /verify → 파일 업로드

3. 관리자 승인
   → admin@ari.ac.kr 로그인 → /admin → 인증 요청 탭 → 승인

4. 좌석 예약 + QR 체크인
   → /seats → 좌석 선택 → 예약
   → /admin → 좌석 관리 탭 → QR 토큰 확인
   → /checkin/{id} → 토큰 입력

5. 퇴실
   → /dashboard → 퇴실하기
```

### CORS 문제 발생 시

브라우저 개발자 도구에서 CORS 오류가 보이면:
```bash
# Cloudflare Pages 도메인을 CORS_ORIGINS에 추가
fly secrets set CORS_ORIGINS="https://ari-project-mvp.pages.dev,http://localhost:5173" \
  --app ari-project-mvp
fly deploy --app ari-project-mvp  # 재배포 필요
```

---

## 볼륨 및 데이터 관리

### 볼륨 상태 확인

```bash
fly volumes list --app ari-project-mvp
```

### DB 백업 (SQLite)

```bash
# 로컬로 DB 파일 복사
fly ssh sftp get /data/ari_project.db ./backup_$(date +%Y%m%d).db \
  --app ari-project-mvp

# 또는 컨테이너 접속 후 수동 백업
fly ssh console --app ari-project-mvp
cp /data/ari_project.db /data/ari_project.db.bak
```

### 볼륨 크기 확장

```bash
fly volumes extend <volume-id> --size 5 --app ari-project-mvp
```

---

## 주요 환경변수 참조

| 변수 | 로컬 개발 | Fly.io 배포 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./ari_project.db` | `sqlite:////data/ari_project.db` |
| `UPLOAD_DIR` | `./uploads` | `/data/uploads` |
| `CORS_ORIGINS` | `http://localhost:5173` | `https://YOUR.pages.dev,http://localhost:5173` |
| `SECRET_KEY` | 로컬용 임의값 | `fly secrets set`으로 강한 랜덤 값 |
| `RESERVATION_EXPIRY_SECONDS` | `600` (10분) | `600` (또는 원하는 값) |

---

## 비용 (2025 기준)

| 서비스 | 무료 tier | 유료 |
|---|---|---|
| Cloudflare Pages | 무료 (500 빌드/월, 무제한 대역폭) | — |
| Fly.io 컨테이너 | 공유 CPU 1x 256MB (약 $0/월, 절전 모드) | $1.94/월 (256MB always-on) |
| Fly.io 볼륨 | 3GB 무료 | $0.15/GB/월 |
| **합계** | **$0** (절전 모드) | **~$2/월** (always-on) |

> 공모전 시연 및 파일럿 운영은 무료 tier로 충분합니다.
> `auto_stop_machines = true` 설정 시 요청이 없는 동안 머신이 절전 → cold start 약 1~3초 발생.
> 시연 직전에 한 번 요청을 보내 머신을 깨워두는 것을 권장합니다.

---

## 실제 운영 전환 (PostgreSQL + R2)

현재 SQLite + Fly.io 볼륨은 **시연·파일럿 목적**입니다.
학교에 정식 서비스로 확대할 경우 아래 전환을 권장합니다.

### DB: SQLite → PostgreSQL

`DATABASE_URL` 환경변수만 변경하면 됩니다 (코드 수정 없음).

```bash
# Supabase, Railway, Neon 등에서 PostgreSQL URL 발급 후:
fly secrets set DATABASE_URL="postgresql://user:pass@host:5432/ari_db" \
  --app ari-project-mvp

# psycopg2 설치 (requirements.txt에 추가)
echo "psycopg2-binary" >> backend/requirements.txt
fly deploy --app ari-project-mvp
```

### 파일 저장: Fly.io 볼륨 → Cloudflare R2 (또는 AWS S3)

`backend/routers/verifications.py`의 파일 저장 로직만 수정합니다.
현재: 로컬 파일시스템 → 변경: boto3 + R2/S3 업로드
변경 범위: `submit_verification()` 함수 약 10줄.

```python
# 변경 전 (현재)
with open(file_path, "wb") as f:
    f.write(content)

# 변경 후 (R2/S3)
import boto3
s3 = boto3.client("s3", endpoint_url=R2_ENDPOINT, ...)
s3.put_object(Bucket=BUCKET, Key=safe_filename, Body=content)
```
