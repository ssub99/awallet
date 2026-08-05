#!/usr/bin/env bash
set -euo pipefail

# 로컬 개발: 루트 `.env`만 사용 (`cp .env.example .env` 후 값 입력).
if [ ! -f ".env" ]; then
  echo "[expo] .env 파일이 없습니다. .env.example 을 복사해 값을 채워 주세요."
  exit 1
fi

set -a
. ./.env
set +a

# 공지 작성·등록 시 static/app-notices.json sync (미디어 업로드 포함 — 예전 프로세스는 종료)
bash ./scripts/run-dev-notices-sync.sh &
DEV_NOTICES_SYNC_PID=$!
trap 'kill "$DEV_NOTICES_SYNC_PID" 2>/dev/null || true' EXIT INT TERM

sleep 0.4
if ! curl -sf "http://127.0.0.1:${DEV_NOTICES_SYNC_PORT:-8787}/health" | grep -q '"media":true'; then
  echo "[dev-notices-sync] 서버 기동 실패. 포트 ${DEV_NOTICES_SYNC_PORT:-8787} 확인 후 다시 실행해 주세요."
  kill "$DEV_NOTICES_SYNC_PID" 2>/dev/null || true
  exit 1
fi
echo "[dev-notices-sync] OK — http://127.0.0.1:${DEV_NOTICES_SYNC_PORT:-8787} (media upload enabled)"

npx expo start -c
