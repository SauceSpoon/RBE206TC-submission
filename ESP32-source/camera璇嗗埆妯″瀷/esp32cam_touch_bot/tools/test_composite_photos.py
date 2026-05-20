#!/usr/bin/env python3
"""Run color segmentation + shape model on multi-object composite photos."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms

from train_shape_model import CLASSES, ShapeNet


IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
COLOR_ORDER = ["black", "blue", "green", "red"]
BOX_COLORS = {
  "black": (30, 30, 30),
  "blue": (255, 90, 30),
  "green": (60, 180, 60),
  "red": (40, 40, 230),
}


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--image-dir", default="../照片/组合")
  parser.add_argument("--model", default="models/shape_classifier/best.pt")
  parser.add_argument("--out-dir", default="models/shape_classifier/composite_test")
  parser.add_argument("--min-area", type=int, default=550)
  parser.add_argument("--min-fill-ratio", type=float, default=0.18)
  parser.add_argument("--min-shape-conf", type=float, default=0.75)
  parser.add_argument("--box-pad", type=float, default=0.18)
  return parser.parse_args()


def load_model(model_path: Path) -> tuple[ShapeNet, int]:
  checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
  model = ShapeNet(num_classes=len(checkpoint["classes"]))
  model.load_state_dict(checkpoint["model_state"])
  model.eval()
  return model, int(checkpoint["image_size"])


def build_transform(image_size: int) -> transforms.Compose:
  return transforms.Compose([
    transforms.Resize((image_size, image_size)),
    transforms.ToTensor(),
    transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
  ])


def color_masks(bgr: np.ndarray) -> dict[str, np.ndarray]:
  hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
  h, s, v = cv2.split(hsv)

  masks: dict[str, np.ndarray] = {}
  masks["black"] = ((v <= 75) & (s <= 165)).astype(np.uint8) * 255
  masks["blue"] = cv2.inRange(hsv, np.array([92, 65, 45]), np.array([135, 255, 255]))
  masks["green"] = cv2.inRange(hsv, np.array([38, 70, 45]), np.array([88, 255, 255]))
  red_a = cv2.inRange(hsv, np.array([0, 65, 45]), np.array([12, 255, 255]))
  red_b = cv2.inRange(hsv, np.array([168, 65, 45]), np.array([179, 255, 255]))
  masks["red"] = cv2.bitwise_or(red_a, red_b)
  return masks


def clean_mask(mask: np.ndarray) -> np.ndarray:
  kernel = np.ones((5, 5), np.uint8)
  mask = cv2.medianBlur(mask, 5)
  mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
  mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
  return mask


def expand_box(x: int, y: int, w: int, h: int, img_w: int, img_h: int, pad: float) -> tuple[int, int, int, int]:
  px = int(w * pad)
  py = int(h * pad)
  x1 = max(0, x - px)
  y1 = max(0, y - py)
  x2 = min(img_w, x + w + px)
  y2 = min(img_h, y + h + py)
  return x1, y1, x2, y2


def classify_roi(model: ShapeNet, tf: transforms.Compose, bgr_roi: np.ndarray) -> tuple[str, float, list[float]]:
  rgb = cv2.cvtColor(bgr_roi, cv2.COLOR_BGR2RGB)
  image = Image.fromarray(rgb)
  tensor = tf(image).unsqueeze(0)
  with torch.no_grad():
    probs = torch.softmax(model(tensor), dim=1).squeeze(0).cpu().numpy()
  idx = int(probs.argmax())
  return CLASSES[idx], float(probs[idx]), [float(p) for p in probs]


def detect_image(
  image_path: Path,
  model: ShapeNet,
  tf: transforms.Compose,
  out_image_path: Path,
  min_area: int,
  min_fill_ratio: float,
  min_shape_conf: float,
  box_pad: float,
) -> list[dict[str, object]]:
  bgr = cv2.imread(str(image_path))
  if bgr is None:
    raise RuntimeError(f"Could not read image: {image_path}")

  detections, annotated = detect_frame(
    bgr,
    image_path.name,
    model,
    tf,
    min_area,
    min_fill_ratio,
    min_shape_conf,
    box_pad,
  )
  cv2.imwrite(str(out_image_path), annotated)
  return detections


def detect_frame(
  bgr: np.ndarray,
  image_name: str,
  model: ShapeNet,
  tf: transforms.Compose,
  min_area: int,
  min_fill_ratio: float,
  min_shape_conf: float,
  box_pad: float,
) -> tuple[list[dict[str, object]], np.ndarray]:
  img_h, img_w = bgr.shape[:2]
  annotated = bgr.copy()
  detections: list[dict[str, object]] = []

  for color in COLOR_ORDER:
    mask = clean_mask(color_masks(bgr)[color])
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
      area = cv2.contourArea(contour)
      if area < min_area:
        continue

      x, y, w, h = cv2.boundingRect(contour)
      if w < 12 or h < 12:
        continue

      aspect = w / float(h)
      if aspect < 0.45 or aspect > 2.25:
        continue

      fill_ratio = area / float(w * h)
      if fill_ratio < min_fill_ratio:
        continue

      x1, y1, x2, y2 = expand_box(x, y, w, h, img_w, img_h, box_pad)
      roi = bgr[y1:y2, x1:x2]
      shape, shape_conf, probs = classify_roi(model, tf, roi)
      if shape_conf < min_shape_conf:
        continue

      cx = x + w / 2.0
      cy = y + h / 2.0
      label = f"{color}_{shape} {shape_conf:.2f}"
      cv2.rectangle(annotated, (x1, y1), (x2, y2), BOX_COLORS[color], 2)
      cv2.putText(annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, BOX_COLORS[color], 1, cv2.LINE_AA)

      detections.append({
        "image": image_name,
        "color": color,
        "shape": shape,
        "label": f"{color}_{shape}",
        "shape_conf": shape_conf,
        "box": [int(x1), int(y1), int(x2), int(y2)],
        "center": [round(cx, 1), round(cy, 1)],
        "area": float(area),
        "fill_ratio": float(fill_ratio),
        "shape_probs": {name: probs[idx] for idx, name in enumerate(CLASSES)},
      })

  detections.sort(key=lambda d: float(d["area"]), reverse=True)
  return detections, annotated


def main() -> None:
  args = parse_args()
  image_dir = Path(args.image_dir)
  out_dir = Path(args.out_dir)
  ann_dir = out_dir / "annotated"
  out_dir.mkdir(parents=True, exist_ok=True)
  ann_dir.mkdir(parents=True, exist_ok=True)

  model, image_size = load_model(Path(args.model))
  tf = build_transform(image_size)

  images = sorted(path for path in image_dir.iterdir() if path.suffix.lower() in IMAGE_EXTS)
  if not images:
    raise RuntimeError(f"No images found in {image_dir}")

  all_rows: list[dict[str, object]] = []
  summary: dict[str, int] = {}

  for image_path in images:
    out_image_path = ann_dir / image_path.name
    detections = detect_image(
      image_path,
      model,
      tf,
      out_image_path,
      args.min_area,
      args.min_fill_ratio,
      args.min_shape_conf,
      args.box_pad,
    )
    for det in detections:
      summary[str(det["label"])] = summary.get(str(det["label"]), 0) + 1
      all_rows.append(det)
    labels = ", ".join(f"{d['label']}:{float(d['shape_conf']):.2f}" for d in detections) or "none"
    print(f"{image_path.name}: {labels}")

  csv_path = out_dir / "detections.csv"
  with csv_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["image", "label", "color", "shape", "shape_conf", "box", "center", "area"])
    writer.writeheader()
    for row in all_rows:
      writer.writerow({
        "image": row["image"],
        "label": row["label"],
        "color": row["color"],
        "shape": row["shape"],
        "shape_conf": f"{float(row['shape_conf']):.4f}",
        "box": json.dumps(row["box"]),
        "center": json.dumps(row["center"]),
        "area": f"{float(row['area']):.1f}",
      })

  report = {
    "image_dir": str(image_dir),
    "model": str(args.model),
    "image_count": len(images),
    "detection_count": len(all_rows),
    "summary": dict(sorted(summary.items())),
    "detections": all_rows,
  }
  (out_dir / "detections.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

  print("")
  print(f"Images: {len(images)}")
  print(f"Detections: {len(all_rows)}")
  print(f"Saved CSV: {csv_path}")
  print(f"Saved annotated images: {ann_dir}")


if __name__ == "__main__":
  main()
