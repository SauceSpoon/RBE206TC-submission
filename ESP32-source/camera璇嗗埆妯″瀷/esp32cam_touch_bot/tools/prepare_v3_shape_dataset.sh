#!/usr/bin/env bash
set -euo pipefail

# Merge the base shape dataset with manually labeled live hard ROI crops.

usage() {
  echo "Usage: $0 [-b base_dir] [-r hard_dir] [-o output_dir] [--clean]"
  echo "  -b  base shape dataset, default: dataset/shape_model"
  echo "  -r  live hard ROI dataset, default: dataset/live_hard_shape_rois"
  echo "  -o  merged output dataset, default: dataset/shape_model_v3_live_hard"
  echo "  --clean  remove output_dir before copying"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="$PROJECT_DIR/dataset/shape_model"
HARD_DIR="$PROJECT_DIR/dataset/live_hard_shape_rois"
OUT_DIR="$PROJECT_DIR/dataset/shape_model_v3_live_hard"
CLEAN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--base)
      BASE_DIR="${2:-}"
      shift 2
      ;;
    -r|--hard)
      HARD_DIR="${2:-}"
      shift 2
      ;;
    -o|--output)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --clean)
      CLEAN=1
      shift
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

if [[ ! -d "$BASE_DIR" ]]; then
  echo "Base dataset not found: $BASE_DIR"
  exit 1
fi

if [[ "$CLEAN" -eq 1 && -d "$OUT_DIR" ]]; then
  rm -rf "$OUT_DIR"
fi

mkdir -p "$OUT_DIR"/{cube,ball,pyramid}

copy_images() {
  local src="$1"
  local dst="$2"
  local prefix="$3"

  if [[ ! -d "$src" ]]; then
    return 0
  fi

  local count=0
  while IFS= read -r -d '' file; do
    local base
    base="$(basename "$file")"
    cp "$file" "$dst/${prefix}__${base}"
    count=$((count + 1))
  done < <(find "$src" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) -print0)

  echo "$count"
}

for shape in cube ball pyramid; do
  base_count="$(copy_images "$BASE_DIR/$shape" "$OUT_DIR/$shape" "base")"
  hard_count="$(copy_images "$HARD_DIR/$shape" "$OUT_DIR/$shape" "hard")"
  total=$(find "$OUT_DIR/$shape" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) | wc -l | awk '{print $1}')
  printf "%-8s base=%4s hard=%4s total=%4d\n" "$shape" "${base_count:-0}" "${hard_count:-0}" "$total"
done
