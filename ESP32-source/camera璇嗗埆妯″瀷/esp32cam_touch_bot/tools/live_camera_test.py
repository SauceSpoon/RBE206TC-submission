#!/usr/bin/env python3
"""Live camera test for color segmentation + shape CNN."""

from __future__ import annotations

import argparse
import csv
import json
import select
import sys
import time
import urllib.request
from urllib.error import URLError
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from test_composite_photos import build_transform, detect_frame, load_model


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--source", default="0", help="Camera index, image path, or http://<esp32-ip>/capture")
  parser.add_argument("--esp32-ip", default="", help="Shortcut for http://<ip>/capture")
  parser.add_argument("--model", default="models/shape_classifier_v2_full_hard/best.pt")
  parser.add_argument("--out-dir", default="models/shape_classifier_v2_full_hard/live_test")
  parser.add_argument("--frames", type=int, default=0, help="Number of frames to process. 0 means run until stopped.")
  parser.add_argument("--interval", type=float, default=0.25)
  parser.add_argument("--retry-delay", type=float, default=1.0)
  parser.add_argument("--print-every", type=int, default=1, help="Print detections every N frames. Use 0 to disable per-frame logs.")
  parser.add_argument("--save-every", type=int, default=10)
  parser.add_argument("--target", default="", help="Optional target label, e.g. red_cube")
  parser.add_argument("--focus-color", choices=["black", "blue", "green", "red"], default="", help="Show/collect detections of one color without requiring a shape match.")
  parser.add_argument("--collect-dir", default="", help="Optional directory for manually labeled hard ROI crops.")
  parser.add_argument("--collect-mode", choices=["largest", "all"], default="largest", help="When labeling, save the largest shown detection or all shown detections.")
  parser.add_argument("--min-area", type=int, default=550)
  parser.add_argument("--min-fill-ratio", type=float, default=0.18)
  parser.add_argument("--min-shape-conf", type=float, default=0.75)
  parser.add_argument("--box-pad", type=float, default=0.18)
  parser.add_argument("--display", action="store_true")
  return parser.parse_args()


def normalize_source(args: argparse.Namespace) -> str:
  if args.esp32_ip:
    return f"http://{args.esp32_ip}/capture"
  return args.source


def is_url(source: str) -> bool:
  return source.startswith("http://") or source.startswith("https://")


def read_http_frame(url: str) -> np.ndarray:
  with urllib.request.urlopen(url, timeout=3.0) as response:
    data = response.read()
  arr = np.frombuffer(data, dtype=np.uint8)
  frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
  if frame is None:
    raise RuntimeError(f"Could not decode image from {url}")
  return frame


def open_video_source(source: str) -> cv2.VideoCapture | None:
  if is_url(source) or Path(source).is_file():
    return None
  if source.isdigit():
    return cv2.VideoCapture(int(source))
  return cv2.VideoCapture(source)


def read_frame(source: str, cap: cv2.VideoCapture | None) -> np.ndarray:
  if is_url(source):
    return read_http_frame(source)
  if Path(source).is_file():
    frame = cv2.imread(source)
    if frame is None:
      raise RuntimeError(f"Could not read image: {source}")
    return frame
  if cap is None:
    raise RuntimeError("VideoCapture is not open")
  ok, frame = cap.read()
  if not ok or frame is None:
    raise RuntimeError(f"Could not read frame from source: {source}")
  return frame


def filter_target(detections: list[dict[str, object]], target: str) -> list[dict[str, object]]:
  if not target:
    return detections
  return [det for det in detections if det["label"] == target]


def filter_color(detections: list[dict[str, object]], color: str) -> list[dict[str, object]]:
  if not color:
    return detections
  return [det for det in detections if det["color"] == color]


def crop_from_detection(frame: np.ndarray, det: dict[str, object]) -> np.ndarray:
  x1, y1, x2, y2 = [int(v) for v in det["box"]]
  return frame[y1:y2, x1:x2]


def save_hard_examples(
  frame: np.ndarray,
  annotated: np.ndarray,
  detections: list[dict[str, object]],
  collect_dir: Path,
  true_shape: str,
  frame_idx: int,
  collect_mode: str,
) -> int:
  if not detections:
    return 0

  selected = detections
  if collect_mode == "largest":
    selected = [max(detections, key=lambda det: float(det["area"]))]

  shape_dir = collect_dir / true_shape
  frame_dir = collect_dir / "_frames"
  shape_dir.mkdir(parents=True, exist_ok=True)
  frame_dir.mkdir(parents=True, exist_ok=True)

  stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
  cv2.imwrite(str(frame_dir / f"frame_{frame_idx:04d}_{stamp}.jpg"), annotated)

  saved = 0
  for det_idx, det in enumerate(selected, start=1):
    crop = crop_from_detection(frame, det)
    if crop.size == 0:
      continue
    pred_label = str(det["label"])
    conf = float(det["shape_conf"])
    name = f"{true_shape}__frame_{frame_idx:04d}_{stamp}__det_{det_idx}__pred_{pred_label}_{conf:.2f}.jpg"
    if cv2.imwrite(str(shape_dir / name), crop):
      saved += 1
  return saved


def read_terminal_command() -> str:
  if not sys.stdin.isatty():
    return ""
  ready, _, _ = select.select([sys.stdin], [], [], 0)
  if not ready:
    return ""
  return sys.stdin.readline().strip().lower()


def shape_from_key(key: int) -> str:
  return {ord("c"): "cube", ord("b"): "ball", ord("p"): "pyramid"}[key]


def shape_from_command(command: str) -> str:
  aliases = {
    "c": "cube",
    "cube": "cube",
    "b": "ball",
    "ball": "ball",
    "p": "pyramid",
    "pyramid": "pyramid",
  }
  return aliases.get(command, "")


def main() -> None:
  args = parse_args()
  source = normalize_source(args)
  out_dir = Path(args.out_dir)
  frames_dir = out_dir / "frames"
  out_dir.mkdir(parents=True, exist_ok=True)
  frames_dir.mkdir(parents=True, exist_ok=True)
  collect_dir = Path(args.collect_dir) if args.collect_dir else None

  model, image_size = load_model(Path(args.model))
  tf = build_transform(image_size)
  cap = open_video_source(source)
  if cap is not None and not cap.isOpened():
    raise RuntimeError(f"Could not open camera source: {source}")

  rows: list[dict[str, object]] = []
  latest_path = out_dir / "latest.jpg"
  pending_shape = ""

  print(f"Source: {source}")
  print(f"Model: {args.model}")
  print(f"Output: {out_dir}")
  if args.target:
    print(f"Target filter: {args.target}")
  if args.focus_color:
    print(f"Color focus: {args.focus_color}")
  if collect_dir:
    print(f"Collect hard ROI crops: {collect_dir}")
    print("Label controls: c/b/p=choose true shape, Enter=save, Esc=cancel, s=save annotated frame, q=quit")
    print("Terminal controls: type c, b, or p then Enter to save the current shown ROI immediately.")

  try:
    idx = 1
    while args.frames <= 0 or idx <= args.frames:
      started = time.time()
      try:
        frame = read_frame(source, cap)
      except (RuntimeError, TimeoutError, URLError, OSError) as exc:
        print(f"frame {idx:04d}: camera read failed: {exc}; retrying in {args.retry_delay}s", flush=True)
        time.sleep(args.retry_delay)
        continue
      detections, annotated = detect_frame(
        frame,
        f"frame_{idx:04d}",
        model,
        tf,
        args.min_area,
        args.min_fill_ratio,
        args.min_shape_conf,
        args.box_pad,
      )
      shown_detections = filter_target(detections, args.target)
      shown_detections = filter_color(shown_detections, args.focus_color)

      cv2.imwrite(str(latest_path), annotated)
      if args.save_every > 0 and (idx == 1 or idx % args.save_every == 0):
        cv2.imwrite(str(frames_dir / f"frame_{idx:04d}.jpg"), annotated)

      labels = ", ".join(f"{d['label']}:{float(d['shape_conf']):.2f}" for d in shown_detections) or "none"
      if pending_shape:
        cv2.putText(
          annotated,
          f"pending: {pending_shape}  Enter=save  Esc=cancel",
          (8, 24),
          cv2.FONT_HERSHEY_SIMPLEX,
          0.65,
          (0, 220, 255),
          2,
          cv2.LINE_AA,
        )
      if args.print_every > 0 and idx % args.print_every == 0:
        print(f"frame {idx:04d}: {labels}", flush=True)

      for det in shown_detections:
        rows.append({
          "frame": idx,
          "time": round(time.time(), 3),
          "label": det["label"],
          "color": det["color"],
          "shape": det["shape"],
          "shape_conf": round(float(det["shape_conf"]), 4),
          "box": json.dumps(det["box"]),
          "center": json.dumps(det["center"]),
          "area": round(float(det["area"]), 1),
        })

      if args.display:
        cv2.imshow("live_camera_test", annotated)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
          break
        if collect_dir and key in (ord("c"), ord("b"), ord("p")):
          pending_shape = shape_from_key(key)
          print(f"pending label: {pending_shape}; press Enter to save or Esc to cancel", flush=True)
        elif collect_dir and pending_shape and key in (10, 13):
          saved = save_hard_examples(frame, annotated, shown_detections, collect_dir, pending_shape, idx, args.collect_mode)
          print(f"saved {saved} hard example(s) as {pending_shape}", flush=True)
          pending_shape = ""
        elif collect_dir and pending_shape and key == 27:
          print(f"cancelled pending label: {pending_shape}", flush=True)
          pending_shape = ""
        elif collect_dir and key == ord("s"):
          frame_dir = collect_dir / "_frames"
          frame_dir.mkdir(parents=True, exist_ok=True)
          stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
          path = frame_dir / f"frame_{idx:04d}_{stamp}.jpg"
          cv2.imwrite(str(path), annotated)
          print(f"saved annotated frame: {path}", flush=True)

      command = read_terminal_command()
      if command:
        if command == "q":
          break
        true_shape = shape_from_command(command)
        if collect_dir and true_shape:
          saved = save_hard_examples(frame, annotated, shown_detections, collect_dir, true_shape, idx, args.collect_mode)
          print(f"saved {saved} hard example(s) as {true_shape}", flush=True)
        elif command in ("s", "save"):
          frame_dir = collect_dir / "_frames" if collect_dir else frames_dir
          frame_dir.mkdir(parents=True, exist_ok=True)
          stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
          path = frame_dir / f"frame_{idx:04d}_{stamp}.jpg"
          cv2.imwrite(str(path), annotated)
          print(f"saved annotated frame: {path}", flush=True)
        else:
          print(f"ignored terminal command: {command}", flush=True)

      elapsed = time.time() - started
      if args.interval > elapsed:
        time.sleep(args.interval - elapsed)
      idx += 1
  except KeyboardInterrupt:
    print("")
    print("Stopped by user.")
  finally:
    if cap is not None:
      cap.release()
    if args.display:
      cv2.destroyAllWindows()

  csv_path = out_dir / "detections.csv"
  with csv_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["frame", "time", "label", "color", "shape", "shape_conf", "box", "center", "area"])
    writer.writeheader()
    writer.writerows(rows)

  print("")
  print(f"Saved latest annotated frame: {latest_path}")
  print(f"Saved sampled frames: {frames_dir}")
  print(f"Saved detections: {csv_path}")


if __name__ == "__main__":
  main()
