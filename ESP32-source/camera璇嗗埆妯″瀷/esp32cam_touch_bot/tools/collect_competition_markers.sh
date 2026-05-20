#!/usr/bin/env bash
set -euo pipefail

# Collect raw ESP32-CAM images for Task1 color-threshold tuning.
# Classes are not CNN labels; they are calibration buckets for HSV/rule tuning.
# Usage:
# ./tools/collect_competition_markers.sh -i 172.20.10.11 -n 150 -o dataset/competition_markers -t 0.35

usage() {
  echo "Usage: $0 -i <esp32_ip> [-n per_bucket_count] [-o output_dir] [-t interval_sec]"
  echo "  -i  ESP32-CAM IP address"
  echo "  -n  images per bucket, default: 150"
  echo "  -o  output root directory, default: dataset/competition_markers"
  echo "  -t  capture interval seconds, default: 0.35"
}

IP=""
COUNT="150"
OUT_ROOT="dataset/competition_markers"
INTERVAL="0.35"

while getopts ":i:n:o:t:h" opt; do
  case "$opt" in
    i) IP="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    o) OUT_ROOT="$OPTARG" ;;
    t) INTERVAL="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Invalid option: -$OPTARG"; usage; exit 1 ;;
    :) echo "Option -$OPTARG requires an argument."; usage; exit 1 ;;
  esac
done

if [[ -z "$IP" ]]; then
  usage
  exit 1
fi

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "Count must be an integer"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_SCRIPT="$SCRIPT_DIR/capture_dataset.sh"

if [[ ! -x "$CAPTURE_SCRIPT" ]]; then
  chmod +x "$CAPTURE_SCRIPT"
fi

BUCKETS=(
  yellow_column
  black_column
  black_boundary_line
  background_negative
)

echo "Competition marker collection"
echo "ESP32-CAM: http://$IP/capture"
echo "Per bucket: $COUNT"
echo "Output root: $OUT_ROOT"

for bucket in "${BUCKETS[@]}"; do
  echo ""
  echo "========== Collecting $bucket =========="
  case "$bucket" in
    yellow_column)
      echo "Place the yellow obstacle column at varied distances and angles."
      ;;
    black_column)
      echo "Place only the black goal column in view; avoid black boundary line in this bucket."
      ;;
    black_boundary_line)
      echo "Show the floor boundary line without the black goal column."
      ;;
    background_negative)
      echo "Show floor, shadows, robot body, and empty scene without target columns."
      ;;
  esac
  read -r -p "Press Enter to start capturing $bucket ... " _
  "$CAPTURE_SCRIPT" -i "$IP" -l "$bucket" -n "$COUNT" -o "$OUT_ROOT" -t "$INTERVAL"
done

echo ""
echo "Competition marker collection completed."
