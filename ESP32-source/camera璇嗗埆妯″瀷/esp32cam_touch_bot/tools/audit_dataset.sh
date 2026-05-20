#!/usr/bin/env bash
set -euo pipefail

# Audit dataset completeness for 12-class competition naming: color_shape
# Usage:
# ./tools/audit_dataset.sh -d dataset/raw -m 250

usage() {
  echo "Usage: $0 -d <dataset_dir> [-m min_per_class]"
  echo "  -d  dataset directory, e.g. dataset/raw"
  echo "  -m  expected minimum images per class, default: 250"
}

DATA_DIR=""
MIN_COUNT="250"

while getopts ":d:m:h" opt; do
  case "$opt" in
    d) DATA_DIR="$OPTARG" ;;
    m) MIN_COUNT="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Invalid option: -$OPTARG"; usage; exit 1 ;;
    :) echo "Option -$OPTARG requires an argument."; usage; exit 1 ;;
  esac
done

if [[ -z "$DATA_DIR" ]]; then
  usage
  exit 1
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "Dataset directory not found: $DATA_DIR"
  exit 1
fi

if ! [[ "$MIN_COUNT" =~ ^[0-9]+$ ]]; then
  echo "min_per_class must be an integer"
  exit 1
fi

COLORS=(black blue green red)
SHAPES=(cube ball pyramid)

echo "Auditing dataset: $DATA_DIR"
echo "Expected min per class: $MIN_COUNT"
echo ""

total=0
shortage=0

for color in "${COLORS[@]}"; do
  for shape in "${SHAPES[@]}"; do
    label="${color}_${shape}"
    class_dir="$DATA_DIR/$label"

    if [[ -d "$class_dir" ]]; then
      count=$(find "$class_dir" -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' \) | wc -l | awk '{print $1}')
    else
      count=0
    fi

    total=$((total + count))

    if (( count < MIN_COUNT )); then
      need=$((MIN_COUNT - count))
      shortage=$((shortage + need))
      printf "%-18s %5d  (need +%d)\n" "$label" "$count" "$need"
    else
      printf "%-18s %5d  (ok)\n" "$label" "$count"
    fi
  done
done

echo ""
echo "Total images: $total"
if (( shortage > 0 )); then
  echo "Total shortage to target: $shortage"
  exit 2
else
  echo "All classes reach minimum target."
fi
