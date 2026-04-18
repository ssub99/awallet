#!/usr/bin/env bash
# 로드 순서: `.env` → `.env.ing.local` (뒤가 앞을 덮어씀)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
if [ -f ".env.ing.local" ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.ing.local
  set +a
else
  echo "[start:ing] .env.ing.local 파일이 없습니다."
  echo "[start:ing] .env.ing.local.example 을 복사해 .env.ing.local 로 두고 값을 채워주세요."
  exit 1
fi
exec npx expo start -c "$@"
