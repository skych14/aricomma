#!/bin/bash
# 아리쉼표 MVP — 개발 서버 동시 실행 스크립트
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "==================================="
echo "  🛏️  아리쉼표 MVP 개발 서버 시작"
echo "==================================="

# 환경변수 파일 확인
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "✅ backend/.env 생성됨 (.env.example 복사)"
fi
if [ ! -f "$FRONTEND/.env" ]; then
  cp "$FRONTEND/.env.example" "$FRONTEND/.env"
  echo "✅ frontend/.env 생성됨 (.env.example 복사)"
fi

# 의존성 확인 및 설치
echo ""
echo "📦 의존성 확인 중..."
cd "$BACKEND" && pip install -r requirements.txt -q
cd "$FRONTEND" && npm install --silent 2>/dev/null || true

# Seed 데이터
echo ""
echo "🌱 Seed 데이터 확인..."
cd "$BACKEND" && python seed.py 2>&1 | grep -E "(생성|완료|이미)" || true

echo ""
echo "🚀 서버 시작..."
echo "  백엔드: http://localhost:8000"
echo "  프론트: http://localhost:5173"
echo "  Ctrl+C로 모두 종료"
echo ""

# 백그라운드에서 백엔드 실행
cd "$BACKEND"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 프론트엔드 실행 (포그라운드)
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

# 종료 시 두 프로세스 모두 Kill
trap "echo ''; echo '서버를 종료합니다...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
