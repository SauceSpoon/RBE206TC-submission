#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${ESP32_ROBOT_LOG_DIR:-/tmp/esp32-robot-console}"

stop_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$label pid file not found"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    echo "$label pid file is empty"
    return
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid"
    echo "$label stopped: $pid"
  else
    echo "$label was not running: $pid"
  fi

  rm -f "$pid_file"
}

stop_pid_file "web" "$LOG_DIR/web.pid"
stop_pid_file "server" "$LOG_DIR/server.pid"
