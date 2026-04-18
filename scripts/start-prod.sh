#!/usr/bin/env bash
# 로드 순서: `.env` → `.env.production.local` (뒤가 앞을 덮어씀)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
if [ -f ".env.production.local" ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.production.local
  set +a
else
  echo "[start:prod] .env.production.local 파일이 없습니다."
  echo "[start:prod] .env.production.local.example 을 복사해 .env.production.local 로 두고 값을 채워주세요."
  exit 1
fi
exec npx expo start -c "$@"
