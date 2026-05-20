#!/usr/bin/env bash
set -euo pipefail

# Smart ESP32-CAM flash helper:
# - auto-detect serial port
# - compile and upload sketch
# - optional serial monitor

FQBN="esp32:esp32:esp32cam"
BAUD="115200"
PORT=""
MONITOR=0
WAIT=0
INTERVAL=2
TIMEOUT=0
SKETCH_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  echo "Usage: $0 [-p port] [-b baud] [--monitor] [--wait] [--interval sec] [--timeout sec]"
  echo "  -p, --port      Serial port, e.g. /dev/cu.usbserial-1340"
  echo "  -b, --baud      Monitor baud rate (default: 115200)"
  echo "  -m, --monitor   Open serial monitor after upload"
  echo "  -w, --wait      Poll until serial device appears"
  echo "  -i, --interval  Poll interval seconds (default: 2)"
  echo "  -t, --timeout   Wait timeout seconds, 0 means forever (default: 0)"
}

detect_port_from_board_list() {
  arduino-cli board list 2>/dev/null \
    | awk 'NR>1 {print $1}' \
    | grep -E '^/dev/(cu|tty)\.(usbserial|wchusbserial|usbmodem|SLAB|ttyUSB|ttyACM)' \
    | head -n 1 || true
}

detect_port_from_dev() {
  ls /dev/cu.usbserial* /dev/cu.wchusbserial* /dev/cu.usbmodem* /dev/cu.SLAB* 2>/dev/null \
    | head -n 1 || true
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      PORT="${2:-}"
      shift 2
      ;;
    -b|--baud)
      BAUD="${2:-}"
      shift 2
      ;;
    -m|--monitor|--open-monitor)
      MONITOR=1
      shift
      ;;
    -w|--wait)
      WAIT=1
      shift
      ;;
    -i|--interval)
      INTERVAL="${2:-}"
      shift 2
      ;;
    -t|--timeout)
      TIMEOUT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
  echo "--interval and --timeout must be integers"
  exit 1
fi

wait_for_port() {
  local elapsed=0
  while true; do
    if [[ -n "$PORT" ]]; then
      if [[ -e "$PORT" ]]; then
        return 0
      fi
    else
      PORT="$(detect_port_from_board_list)"
      if [[ -z "$PORT" ]]; then
        PORT="$(detect_port_from_dev)"
      fi
      if [[ -n "$PORT" && -e "$PORT" ]]; then
        return 0
      fi
    fi

    if [[ "$WAIT" -ne 1 ]]; then
      return 1
    fi

    if [[ "$TIMEOUT" -gt 0 && "$elapsed" -ge "$TIMEOUT" ]]; then
      return 1
    fi

    echo "Waiting for ESP32 serial port... (${elapsed}s)"
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
  done
}

if ! wait_for_port; then
  echo "No ESP32 serial port found."
  echo "Current serial devices:"
  ls /dev/cu.* /dev/tty.* 2>/dev/null || true
  echo "Try: reconnect USB, then run: arduino-cli board list"
  echo "Or enable wait mode: $0 --wait"
  echo "Or run with explicit port: $0 -p /dev/cu.usbserial-XXXX"
  exit 1
fi

echo "Using port: $PORT"
echo "Sketch: $SKETCH_DIR"

echo "Compiling..."
arduino-cli compile --fqbn "$FQBN" "$SKETCH_DIR"

echo "Uploading..."
arduino-cli upload -p "$PORT" --fqbn "$FQBN" "$SKETCH_DIR"

echo "Upload done."

if [[ "$MONITOR" -eq 1 ]]; then
  echo "Opening monitor at $BAUD bps..."
  arduino-cli monitor -p "$PORT" -c "baudrate=$BAUD"
else
  echo "Tip: open monitor with:"
  echo "arduino-cli monitor -p $PORT -c baudrate=$BAUD"
fi
