#!/bin/bash
# 아리쉼표 배포 스크립트
# 사용법: bash deploy.sh <fly-app-name> <pages-domain>
# 예: bash deploy.sh ari-project-skych ari-project-skych.pages.dev

set -e

APP_NAME="${1:-ari-project-mvp}"
PAGES_DOMAIN="${2:-}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

export PATH="/home/codespace/.fly/bin:$PATH"

echo "=========================================="
echo "  🛏️  아리쉼표 배포 스크립트"
echo "  Fly.io 앱: $APP_NAME"
echo "=========================================="

# ── 1. Fly.io 로그인 확인 ──────────────────────────────────────
echo ""
echo "▶ [1/6] Fly.io 로그인 확인..."
fly auth whoami || {
  echo "❌ Fly.io 로그인이 필요합니다."
  echo "   터미널에서 실행하세요: fly auth login"
  exit 1
}

# ── 2. Fly.io 앱 생성 ─────────────────────────────────────────
echo ""
echo "▶ [2/6] Fly.io 앱 생성..."
cd "$BACKEND"

# fly.toml 앱 이름 업데이트
sed -i "s/^app = .*/app = \"$APP_NAME\"/" fly.toml

if fly apps list 2>/dev/null | grep -q "^$APP_NAME "; then
  echo "   앱 '$APP_NAME' 이미 존재, 건너뜀"
else
  fly apps create "$APP_NAME"
  echo "   ✅ 앱 생성: $APP_NAME"
fi

# ── 3. 볼륨 생성 ────────────────────────────────────────────────
echo ""
echo "▶ [3/6] 영구 볼륨 생성 (SQLite + 업로드 파일)..."
if fly volumes list --app "$APP_NAME" 2>/dev/null | grep -q "ari_data"; then
  echo "   볼륨 'ari_data' 이미 존재, 건너뜀"
else
  fly volumes create ari_data --region nrt --size 1 --app "$APP_NAME" --yes
  echo "   ✅ 볼륨 생성 완료 (1GB, 도쿄 리전)"
fi

# ── 4. 시크릿 설정 ───────────────────────────────────────────────
echo ""
echo "▶ [4/6] 환경변수/시크릿 설정..."

SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

CORS_ORIGINS="http://localhost:5173"
if [ -n "$PAGES_DOMAIN" ]; then
  CORS_ORIGINS="https://${PAGES_DOMAIN},http://localhost:5173"
fi

fly secrets set \
  SECRET_KEY="$SECRET_KEY" \
  CORS_ORIGINS="$CORS_ORIGINS" \
  --app "$APP_NAME"

echo "   ✅ SECRET_KEY 설정 완료"
echo "   ✅ CORS_ORIGINS: $CORS_ORIGINS"

# ── 5. 백엔드 배포 ────────────────────────────────────────────────
echo ""
echo "▶ [5/6] 백엔드 배포 (Fly.io)..."
cd "$BACKEND"
fly deploy --app "$APP_NAME"

BACKEND_URL="https://${APP_NAME}.fly.dev"
echo "   ✅ 백엔드 배포 완료: $BACKEND_URL"

# ── 6. Seed 데이터 ───────────────────────────────────────────────
echo ""
echo "▶ [6/6] 초기 데이터 (Seed) 생성..."
fly ssh console --app "$APP_NAME" --command "cd /app && python seed.py" || {
  echo "   ⚠️ Seed 자동 실행 실패 (머신 기동 중일 수 있음)"
  echo "   나중에 수동 실행: fly ssh console --app $APP_NAME"
  echo "   컨테이너 내부: python /app/seed.py"
}

# ── 완료 ────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  ✅ Fly.io 백엔드 배포 완료!"
echo ""
echo "  백엔드 URL: $BACKEND_URL"
echo "  헬스 체크: curl $BACKEND_URL/health"
echo "  API 문서:  $BACKEND_URL/docs"
echo ""
echo "  다음 단계: Cloudflare Pages 배포"
echo "  (아래 방법 중 선택)"
echo ""
echo "  방법 A — wrangler CLI:"
echo "    cd $FRONTEND"
echo "    VITE_API_URL=$BACKEND_URL npm run build"
echo "    npx wrangler pages deploy dist --project-name $APP_NAME"
echo ""
echo "  방법 B — 웹 UI (브라우저):"
echo "    https://dash.cloudflare.com → Pages → Create project"
echo "    Build command: cd frontend && npm install && npm run build"
echo "    Output dir:    frontend/dist"
echo "    환경변수:      VITE_API_URL=$BACKEND_URL"
echo "=========================================="
