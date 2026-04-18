#!/usr/bin/env bash
set -euo pipefail

# 공통 `.env` → ing 전용 `.env.ing.local` 순으로 로드(나중 값이 우선).
if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

if [ -f ".env.ing.local" ]; then
  set -a
  . ./.env.ing.local
  set +a
else
  echo "[start:ing] .env.ing.local 파일이 없습니다."
  echo "[start:ing] .env.ing.local.example 을 복사해 값을 채워주세요."
  exit 1
fi

npx expo start -c
