#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ESP32_ROBOT_LOG_DIR:-/tmp/esp32-robot-console}"
SERVER_LOG="$LOG_DIR/server.log"
WEB_LOG="$LOG_DIR/web.log"
SERVER_PID="$LOG_DIR/server.pid"
WEB_PID="$LOG_DIR/web.pid"

mkdir -p "$LOG_DIR"

is_up() {
  local url="$1"
  curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

start_server() {
  if is_up "http://127.0.0.1:3001/api/health"; then
    echo "server already running: http://127.0.0.1:3001"
    return
  fi

  (
    cd "$ROOT_DIR"
    nohup npm --workspace @esp32-robot/server run start >"$SERVER_LOG" 2>&1 &
    echo "$!" >"$SERVER_PID"
  )
  echo "server started: http://127.0.0.1:3001"
}

start_web() {
  if is_up "http://127.0.0.1:5173"; then
    echo "web already running: http://127.0.0.1:5173"
    return
  fi

  (
    cd "$ROOT_DIR"
    nohup npm --workspace @esp32-robot/web run dev -- --host 127.0.0.1 --port 5173 >"$WEB_LOG" 2>&1 &
    echo "$!" >"$WEB_PID"
  )
  echo "web started: http://127.0.0.1:5173"
}

start_server
start_web

echo "logs: $LOG_DIR"
echo "open: http://127.0.0.1:5173/"
