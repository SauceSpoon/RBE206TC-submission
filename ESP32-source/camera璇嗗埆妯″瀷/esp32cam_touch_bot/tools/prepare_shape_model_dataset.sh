#!/usr/bin/env bash
set -euo pipefail

# Build the 3-class shape training dataset from the normalized 12-class dataset.
# Input:  dataset/raw/<color>_<shape>
# Output: dataset/shape_model/<shape>

usage() {
  echo "Usage: $0 [-s source_dir] [-o output_dir] [--max-per-shape count] [--clean]"
  echo "  -s  normalized 12-class dataset, default: dataset/raw"
  echo "  -o  shape model dataset, default: dataset/shape_model"
  echo "  --max-per-shape  cap copied images per output shape for balanced training"
  echo "  --clean  remove output_dir before copying"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC_DIR="$PROJECT_DIR/dataset/raw"
OUT_DIR="$PROJECT_DIR/dataset/shape_model"
CLEAN=0
MAX_PER_SHAPE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--source)
      SRC_DIR="${2:-}"
      shift 2
      ;;
    -o|--output)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --max-per-shape)
      MAX_PER_SHAPE="${2:-}"
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

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source directory not found: $SRC_DIR"
  exit 1
fi

if [[ -n "$MAX_PER_SHAPE" ]] && ! [[ "$MAX_PER_SHAPE" =~ ^[0-9]+$ ]]; then
  echo "--max-per-shape must be an integer"
  exit 1
fi

if [[ "$CLEAN" -eq 1 && -d "$OUT_DIR" ]]; then
  rm -rf "$OUT_DIR"
fi

mkdir -p "$OUT_DIR"/{cube,ball,pyramid}

COLORS=(black blue green red)
SHAPES=(cube ball pyramid)

copy_shape_class() {
  local color="$1"
  local shape="$2"
  local src="$SRC_DIR/${color}_${shape}"
  local dst="$OUT_DIR/$shape"

  if [[ ! -d "$src" ]]; then
    echo "WARN missing source: ${color}_${shape}"
    return 0
  fi

  local count=0
  while IFS= read -r -d '' file; do
    local base ext stem out
    base="$(basename "$file")"
    ext="${base##*.}"
    stem="${base%.*}"
    out="$dst/${color}_${shape}__${stem}.${ext}"

    cp "$file" "$out"
    count=$((count + 1))
  done < <(find "$src" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) -print0)

  printf "%-8s <- %-14s %5d\n" "$shape" "${color}_${shape}" "$count"
}

trim_shape_class() {
  local shape="$1"
  local limit="$2"
  local dst="$OUT_DIR/$shape"
  local count

  count=$(find "$dst" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) | wc -l | awk '{print $1}')
  if (( count <= limit )); then
    return 0
  fi

  find "$dst" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) \
    | sort \
    | awk -v limit="$limit" 'NR > limit {print}' \
    | while IFS= read -r file; do
        rm -f "$file"
      done
}

echo "Source: $SRC_DIR"
echo "Output: $OUT_DIR"
echo ""

for color in "${COLORS[@]}"; do
  for shape in "${SHAPES[@]}"; do
    copy_shape_class "$color" "$shape"
  done
done

if [[ -n "$MAX_PER_SHAPE" ]]; then
  echo ""
  echo "Applying max per shape: $MAX_PER_SHAPE"
  for shape in "${SHAPES[@]}"; do
    trim_shape_class "$shape" "$MAX_PER_SHAPE"
  done
fi

echo ""
for shape in "${SHAPES[@]}"; do
  count=$(find "$OUT_DIR/$shape" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) | wc -l | awk '{print $1}')
  printf "%-8s %5d\n" "$shape" "$count"
done
