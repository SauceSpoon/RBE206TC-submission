#!/usr/bin/env bash
set -euo pipefail

# Batch capture images from ESP32-CAM CameraWebServer /capture endpoint.
# Example:
# ./tools/capture_dataset.sh -i 192.168.1.88 -l red_cube -n 300 -o dataset/raw -t 0.35

usage() {
  echo "Usage: $0 -i <esp32_ip> -l <label> -n <count> [-o output_dir] [-t interval_sec]"
  echo "  -i  ESP32-CAM IP address (for CameraWebServer)"
  echo "  -l  class label, e.g. red_cube"
  echo "  -n  image count"
  echo "  -o  output root directory, default: dataset/raw"
  echo "  -t  capture interval in seconds, default: 0.35"
}

IP=""
LABEL=""
COUNT=""
OUT_ROOT="dataset/raw"
INTERVAL="0.35"

while getopts ":i:l:n:o:t:h" opt; do
  case "$opt" in
    i) IP="$OPTARG" ;;
    l) LABEL="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    o) OUT_ROOT="$OPTARG" ;;
    t) INTERVAL="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Invalid option: -$OPTARG"; usage; exit 1 ;;
    :) echo "Option -$OPTARG requires an argument."; usage; exit 1 ;;
  esac
done

if [[ -z "$IP" || -z "$LABEL" || -z "$COUNT" ]]; then
  usage
  exit 1
fi

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "Count must be an integer"
  exit 1
fi

OUT_DIR="$OUT_ROOT/$LABEL"
mkdir -p "$OUT_DIR"

URL="http://$IP/capture"

echo "Capturing $COUNT images for label=$LABEL"
echo "Source: $URL"
echo "Output: $OUT_DIR"

i=1
while [[ "$i" -le "$COUNT" ]]; do
  file=$(printf "%s/%s_%04d.jpg" "$OUT_DIR" "$LABEL" "$i")

  if curl -fsS "$URL" -o "$file"; then
    echo "[$i/$COUNT] saved: $file"
  else
    echo "[$i/$COUNT] capture failed, retrying..."
    sleep 1
    continue
  fi

  # Let user move object / camera between frames.
  sleep "$INTERVAL"
  i=$((i + 1))
done

echo "Done."
