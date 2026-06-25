.PHONY: setup dev backend frontend seed clean

ROOT := $(shell pwd)

setup: ## 의존성 설치 + 환경변수 파일 생성 + seed 데이터
	@[ -f backend/.env ] || cp backend/.env.example backend/.env
	@[ -f frontend/.env ] || cp frontend/.env.example frontend/.env
	cd backend && pip install -r requirements.txt -q
	cd frontend && npm install --silent
	cd backend && python seed.py

dev: ## 백엔드 + 프론트엔드 동시 실행
	@bash start-dev.sh

backend: ## 백엔드만 실행 (포트 8000)
	cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

frontend: ## 프론트엔드만 실행 (포트 5173)
	cd frontend && npm run dev

seed: ## Seed 데이터 재생성
	cd backend && python seed.py

clean: ## DB 파일 + 업로드 파일 삭제 (개발용)
	rm -f backend/ari_project.db
	rm -rf backend/uploads/*
	@echo "DB 및 업로드 파일 삭제 완료"

help: ## 사용 가능한 명령어 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-12s %s\n", $$1, $$2}'
