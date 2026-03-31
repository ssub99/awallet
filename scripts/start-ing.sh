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

# Expo Go는 host 번들 ID라 .stage 분기가 없고 기본이 awallet.vercel.app 이다.
# ing/Preview API를 쓰려면 빌드 시점(env)으로 베이스 URL을 고정해야 한다.
DEFAULT_ING_VERCEL_API_BASE_URL="https://awallet-git-ing-awallet-vercel-api.vercel.app"
export EXPO_PUBLIC_AWALLET_API_BASE_URL="${EXPO_PUBLIC_AWALLET_API_BASE_URL:-$DEFAULT_ING_VERCEL_API_BASE_URL}"

npx expo start -c
