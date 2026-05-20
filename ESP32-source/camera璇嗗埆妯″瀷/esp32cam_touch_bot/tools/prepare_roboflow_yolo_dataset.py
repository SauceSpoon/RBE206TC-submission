#!/usr/bin/env python3
"""Normalize a Roboflow YOLO export for the robot object detector."""

from __future__ import annotations

import argparse
import random
import shutil
from collections import Counter
from pathlib import Path

import yaml


CANONICAL_NAMES = [
  "black_ball",
  "black_cube",
  "black_pyramid",
  "blue_ball",
  "blue_cube",
  "blue_pyramid",
  "green_ball",
  "green_cube",
  "green_pyramid",
  "red_ball",
  "red_cube",
  "red_pyramid",
]


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument(
    "--source",
    default="/Users/yanyangnan/Desktop/ESP32/camera识别模型/照片/analyze.yolov8",
    help="Roboflow YOLO export directory.",
  )
  parser.add_argument(
    "--out",
    default="/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/dataset/yolo_roboflow_v1",
    help="Output YOLO dataset directory.",
  )
  parser.add_argument("--val-ratio", type=float, default=0.2)
  parser.add_argument("--seed", type=int, default=42)
  parser.add_argument("--force", action="store_true")
  return parser.parse_args()


def image_files(images_dir: Path) -> list[Path]:
  return sorted(p for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def primary_class(label_path: Path) -> int:
  for line in label_path.read_text(encoding="utf-8").splitlines():
    parts = line.strip().split()
    if parts:
      return int(float(parts[0]))
  return -1


def format_float(value: float) -> str:
  return f"{value:.12g}"


def normalize_label_line(line: str, label_path: Path) -> tuple[int, str] | None:
  parts = line.strip().split()
  if not parts:
    return None

  cls = int(float(parts[0]))
  if cls < 0 or cls >= len(CANONICAL_NAMES):
    raise ValueError(f"Class id out of range in {label_path}: {line}")

  coords = [float(part) for part in parts[1:]]
  if len(coords) == 4:
    values = coords
  elif len(coords) >= 6 and len(coords) % 2 == 0:
    xs = coords[0::2]
    ys = coords[1::2]
    x_min = min(xs)
    x_max = max(xs)
    y_min = min(ys)
    y_max = max(ys)
    values = [
      (x_min + x_max) / 2,
      (y_min + y_max) / 2,
      x_max - x_min,
      y_max - y_min,
    ]
  else:
    raise ValueError(f"Unsupported YOLO label format in {label_path}: {line}")

  if any(value < 0 or value > 1 for value in values):
    raise ValueError(f"Label coordinate out of range in {label_path}: {line}")

  normalized = " ".join([str(cls), *[format_float(value) for value in values]])
  return cls, normalized


def split_images(images: list[Path], labels_dir: Path, val_ratio: float, seed: int) -> tuple[list[Path], list[Path]]:
  by_class: dict[int, list[Path]] = {}
  for image in images:
    cls = primary_class(labels_dir / f"{image.stem}.txt")
    by_class.setdefault(cls, []).append(image)

  rng = random.Random(seed)
  train: list[Path] = []
  val: list[Path] = []
  for cls_images in by_class.values():
    rng.shuffle(cls_images)
    val_count = max(1, round(len(cls_images) * val_ratio)) if len(cls_images) > 1 else 0
    val.extend(cls_images[:val_count])
    train.extend(cls_images[val_count:])

  return sorted(train), sorted(val)


def copy_split(images: list[Path], labels_dir: Path, out_dir: Path, split: str) -> Counter:
  image_out = out_dir / "images" / split
  label_out = out_dir / "labels" / split
  image_out.mkdir(parents=True, exist_ok=True)
  label_out.mkdir(parents=True, exist_ok=True)

  counts: Counter = Counter()
  for image in images:
    label = labels_dir / f"{image.stem}.txt"
    if not label.exists():
      raise FileNotFoundError(f"Missing label for {image.name}: {label}")

    normalized_lines: list[str] = []
    for line in label.read_text(encoding="utf-8").splitlines():
      normalized = normalize_label_line(line, label)
      if normalized is None:
        continue
      cls, normalized_line = normalized
      normalized_lines.append(normalized_line)
      counts[CANONICAL_NAMES[cls]] += 1

    shutil.copy2(image, image_out / image.name)
    (label_out / label.name).write_text("\n".join(normalized_lines) + "\n", encoding="utf-8")
  return counts


def write_yaml(out_dir: Path) -> None:
  data = {
    "path": str(out_dir),
    "train": "images/train",
    "val": "images/val",
    "test": "images/val",
    "nc": len(CANONICAL_NAMES),
    "names": CANONICAL_NAMES,
  }
  with (out_dir / "data.yaml").open("w", encoding="utf-8") as f:
    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
  (out_dir / "classes.txt").write_text("\n".join(CANONICAL_NAMES) + "\n", encoding="utf-8")


def main() -> None:
  args = parse_args()
  source = Path(args.source)
  out_dir = Path(args.out)
  images_dir = source / "train" / "images"
  labels_dir = source / "train" / "labels"

  if not images_dir.exists() or not labels_dir.exists():
    raise FileNotFoundError(f"Expected train/images and train/labels under {source}")
  if out_dir.exists():
    if not args.force:
      raise FileExistsError(f"{out_dir} already exists. Use --force to overwrite.")
    shutil.rmtree(out_dir)

  images = image_files(images_dir)
  if not images:
    raise RuntimeError(f"No images found in {images_dir}")

  train, val = split_images(images, labels_dir, args.val_ratio, args.seed)
  train_counts = copy_split(train, labels_dir, out_dir, "train")
  val_counts = copy_split(val, labels_dir, out_dir, "val")
  write_yaml(out_dir)

  print(f"source images: {len(images)}")
  print(f"train images: {len(train)}")
  print(f"val images: {len(val)}")
  print(f"data yaml: {out_dir / 'data.yaml'}")
  print("")
  print("class,train_instances,val_instances")
  for name in CANONICAL_NAMES:
    print(f"{name},{train_counts[name]},{val_counts[name]}")


if __name__ == "__main__":
  main()
