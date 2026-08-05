#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p public/notices
cp -R static/notices/. public/notices/ 2>/dev/null || true
cp static/app-version.json public/app-version.json
cp static/app-notices.json public/app-notices.json
printf '%s\n' '<!DOCTYPE html><html><body><p>API only.</p></body></html>' > public/index.html
