#!/usr/bin/env bash
set -euo pipefail

# Normalize the manually captured photo folders into the 12 competition classes.
# Source folders are left untouched. Files are copied into dataset/raw by default.

usage() {
  echo "Usage: $0 [-s source_dir] [-o output_dir] [--clean]"
  echo "  -s  source photo directory, default: ../照片/photodata from project root"
  echo "  -o  normalized output directory, default: dataset/raw"
  echo "  --clean  remove output_dir before copying"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

SRC_DIR="$WORKSPACE_DIR/照片/photodata"
OUT_DIR="$PROJECT_DIR/dataset/raw"
CLEAN=0

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

if [[ "$CLEAN" -eq 1 && -d "$OUT_DIR" ]]; then
  rm -rf "$OUT_DIR"
fi

mkdir -p "$OUT_DIR"

copy_class() {
  local src_name="$1"
  local dst_name="$2"
  local src="$SRC_DIR/$src_name"
  local dst="$OUT_DIR/$dst_name"

  if [[ ! -d "$src" ]]; then
    echo "WARN missing source: $src_name"
    return 0
  fi

  mkdir -p "$dst"

  local count=0
  while IFS= read -r -d '' file; do
    local base ext stem out
    base="$(basename "$file")"
    ext="${base##*.}"
    stem="${base%.*}"
    out="$dst/${src_name// /_}__${stem}.${ext}"

    cp "$file" "$out"
    count=$((count + 1))
  done < <(find "$src" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) -print0)

  printf "%-18s <- %-16s %5d\n" "$dst_name" "$src_name" "$count"
}

echo "Source: $SRC_DIR"
echo "Output: $OUT_DIR"
echo ""

copy_class "black ball" "black_ball"
copy_class "black cube" "black_cube"
copy_class "black triange" "black_pyramid"
copy_class "pyramid" "black_pyramid"

copy_class "blue ball" "blue_ball"
copy_class "blue cube" "blue_cube"
copy_class "blue triangle" "blue_pyramid"

copy_class "green ball" "green_ball"
copy_class "green cube" "green_cube"
copy_class "green triangle" "green_pyramid"

copy_class "red ball" "red_ball"
copy_class "red cube" "red_cube"
copy_class "red triangle" "red_pyramid"

echo ""
"$SCRIPT_DIR/audit_dataset.sh" -d "$OUT_DIR" -m 150 || true
