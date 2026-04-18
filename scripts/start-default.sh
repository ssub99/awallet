#!/usr/bin/env bash
# `npm start` — 프로젝트 루트의 `.env`만 로드한 뒤 Expo 실행
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
exec npx expo start -c "$@"
