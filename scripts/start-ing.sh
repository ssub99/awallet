#!/usr/bin/env bash
set -euo pipefail

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
