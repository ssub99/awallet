#!/usr/bin/env bash
set -euo pipefail

PORT="${DEV_NOTICES_SYNC_PORT:-8787}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

lsof -ti:"${PORT}" | xargs kill -9 2>/dev/null || true
sleep 0.2
exec node "${SCRIPT_DIR}/dev-notices-sync-server.mjs"
