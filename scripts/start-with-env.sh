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

# 공지 작성·등록 시 static/app-notices.json sync (npm run dev:notices-sync 와 동일)
node ./scripts/dev-notices-sync-server.mjs &
DEV_NOTICES_SYNC_PID=$!
trap 'kill "$DEV_NOTICES_SYNC_PID" 2>/dev/null || true' EXIT INT TERM

npx expo start -c
