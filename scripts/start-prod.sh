#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env.production.local" ]; then
  set -a
  . ./.env.production.local
  set +a
else
  echo "[start:prod] .env.production.local 파일이 없습니다."
  echo "[start:prod] .env.production.local.example 을 복사해 값을 채워주세요."
  exit 1
fi

npx expo start -c
