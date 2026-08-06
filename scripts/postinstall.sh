#!/usr/bin/env bash
set -euo pipefail

# Vercel static/API deploy does not need Android Gradle node-path patches.
if [ -n "${VERCEL:-}" ]; then
  echo "Skipping patch-package on Vercel"
  exit 0
fi

patch-package
