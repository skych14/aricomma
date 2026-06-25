FROM python:3.12-slim

# 시스템 의존성 (Pillow, bcrypt 컴파일에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 복사
COPY . .

# 데이터 디렉토리 기본 생성 (볼륨 미마운트 시 로컬 폴백)
RUN mkdir -p /data/uploads

EXPOSE 8000

# PORT 환경변수 지원 (Fly.io 기본은 8000, 필요 시 오버라이드 가능)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
