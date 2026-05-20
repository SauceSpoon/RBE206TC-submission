#!/usr/bin/env bash
set -euo pipefail

check() {
  local label="$1"
  local url="$2"

  if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
    echo "$label: running"
  else
    echo "$label: stopped"
  fi
}

check "server" "http://127.0.0.1:3001/api/health"
check "web" "http://127.0.0.1:5173"
