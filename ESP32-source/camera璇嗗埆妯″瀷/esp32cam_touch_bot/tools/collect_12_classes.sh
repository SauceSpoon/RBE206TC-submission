#!/usr/bin/env bash
set -euo pipefail

# Collect 12 competition classes: 4 colors x 3 shapes.
# Usage:
# ./tools/collect_12_classes.sh -i 192.168.1.88 -n 250 -o dataset/raw -t 0.35

usage() {
  echo "Usage: $0 -i <esp32_ip> [-n per_class_count] [-o output_dir] [-t interval_sec]"
  echo "  -i  ESP32-CAM IP address"
  echo "  -n  images per class, default: 250"
  echo "  -o  output root directory, default: dataset/raw"
  echo "  -t  capture interval seconds, default: 0.35"
}

IP=""
COUNT="250"
OUT_ROOT="dataset/raw"
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

SHAPES=(cube ball pyramid)
COLORS=(black blue green red)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_SCRIPT="$SCRIPT_DIR/capture_dataset.sh"

if [[ ! -x "$CAPTURE_SCRIPT" ]]; then
  echo "capture_dataset.sh is not executable, fixing..."
  chmod +x "$CAPTURE_SCRIPT"
fi

echo "Plan: ${#COLORS[@]} colors x ${#SHAPES[@]} shapes = $((${#COLORS[@]} * ${#SHAPES[@]})) classes"
echo "Per class: $COUNT"
echo "Output root: $OUT_ROOT"

for color in "${COLORS[@]}"; do
  for shape in "${SHAPES[@]}"; do
    label="${color}_${shape}"
    echo ""
    echo "========== Collecting $label =========="
    echo "Set physical object to: color=$color shape=$shape"
    read -r -p "Press Enter to start capturing $label ... " _

    "$CAPTURE_SCRIPT" -i "$IP" -l "$label" -n "$COUNT" -o "$OUT_ROOT" -t "$INTERVAL"
  done
done

echo ""
echo "All 12 classes collection completed."
