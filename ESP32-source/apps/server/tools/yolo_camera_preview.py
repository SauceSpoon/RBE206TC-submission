#!/usr/bin/env python3
"""YOLO camera preview for ESP32-CAM streams.

This is intentionally local-only: it opens a camera stream, optionally fixes
frame orientation, runs YOLO, and shows the annotated preview window.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import time

import cv2
import numpy as np
from ultralytics import YOLO

COLOR_RANGES = {
    "red": [((0, 80, 45), (10, 255, 255)), ((170, 80, 45), (180, 255, 255))],
    "blue": [((95, 60, 40), (135, 255, 255))],
    "green": [((38, 45, 35), (90, 255, 255))],
    "black": [((0, 0, 0), (180, 255, 80))],
}
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[3] / "yolo" / "最新的" / "best.pt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preview ESP32-CAM stream with a YOLO model")
    parser.add_argument("--model", default=str(DEFAULT_MODEL_PATH), help="Path to YOLO .pt model")
    parser.add_argument("--camera", required=True, help="Camera stream URL/IP or local camera index, for example 192.168.10.11 or 0")
    parser.add_argument("--imgsz", type=int, default=416, help="YOLO inference image size")
    parser.add_argument("--conf", type=float, default=0.25, help="YOLO confidence threshold")
    parser.add_argument("--rotate-180", action="store_true", help="Rotate frames 180 degrees before inference")
    parser.add_argument("--flip-horizontal", action="store_true", help="Mirror frames left/right before inference")
    parser.add_argument("--flip-vertical", action="store_true", help="Mirror frames up/down before inference")
    parser.add_argument("--color-correct", action="store_true", help="Correct YOLO label color from the center of each box")
    parser.add_argument("--display-scale", type=float, default=1.0, help="Scale the preview window display without changing inference frames")
    return parser.parse_args()


def transform_frame(
    frame,
    rotate_180: bool = False,
    flip_horizontal: bool = False,
    flip_vertical: bool = False,
):
    if rotate_180:
        frame = cv2.rotate(frame, cv2.ROTATE_180)
    if flip_horizontal and flip_vertical:
        frame = cv2.flip(frame, -1)
    elif flip_horizontal:
        frame = cv2.flip(frame, 1)
    elif flip_vertical:
        frame = cv2.flip(frame, 0)
    return frame


def scale_for_display(frame, display_scale: float = 1.0):
    if display_scale <= 1:
        return frame

    height, width = frame.shape[:2]
    return cv2.resize(
        frame,
        (int(width * display_scale), int(height * display_scale)),
        interpolation=cv2.INTER_NEAREST,
    )


def normalize_camera_url(value: str) -> str:
    source = value.strip()
    if source.startswith("http://") or source.startswith("https://"):
        return source
    if "/" in source:
        return "http://" + source
    return f"http://{source}/stream"


def normalize_camera_source(value: str) -> str | int:
    source = value.strip()
    return int(source) if source.isdigit() else normalize_camera_url(source)


def result_to_detections(result, frame_width: int, frame_height: int, color_correct_frame=None) -> list[dict]:
    names = result.names
    boxes = result.boxes
    if boxes is None:
        return []

    detections = []
    for box in boxes:
        cls_id = int(box.cls[0].item())
        confidence = float(box.conf[0].item())
        x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
        raw_label = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else names[cls_id]
        label = (
            correct_label_color(color_correct_frame, raw_label, (x1, y1, x2, y2))
            if color_correct_frame is not None
            else raw_label
        )
        width = max(0, x2 - x1)
        height = max(0, y2 - y1)
        detections.append(
            {
                "label": label,
                "confidence": round(confidence, 3),
                "cx": int(x1 + width / 2),
                "cy": int(y1 + height / 2),
                "frameWidth": int(frame_width),
                "frameHeight": int(frame_height),
                "area": int(width * height),
                "x": x1,
                "y": y1,
                "width": width,
                "height": height,
            }
        )

    return detections


def center_crop_box(box: tuple[int, int, int, int], width: int, height: int, ratio: float = 0.60) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    x1 = max(0, min(width, int(x1)))
    y1 = max(0, min(height, int(y1)))
    x2 = max(0, min(width, int(x2)))
    y2 = max(0, min(height, int(y2)))
    if x2 <= x1 or y2 <= y1:
        return x1, y1, x2, y2

    box_width = x2 - x1
    box_height = y2 - y1
    inset_x = int(box_width * (1.0 - ratio) / 2.0)
    inset_y = int(box_height * (1.0 - ratio) / 2.0)
    return x1 + inset_x, y1 + inset_y, x2 - inset_x, y2 - inset_y


def detect_dominant_color(frame, box: tuple[int, int, int, int]) -> str | None:
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = center_crop_box(box, width, height)
    if x2 <= x1 or y2 <= y1:
        return None

    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return None

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    scores: dict[str, int] = {}
    for color, ranges in COLOR_RANGES.items():
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for lower, upper in ranges:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(lower), np.array(upper)))
        scores[color] = int(cv2.countNonZero(mask))

    color, score = max(scores.items(), key=lambda item: item[1])
    return color if score >= max(12, int(hsv.shape[0] * hsv.shape[1] * 0.08)) else None


def correct_label_color(frame, label: str, box: tuple[int, int, int, int]) -> str:
    parts = label.split("_", 1)
    if len(parts) != 2:
        return label

    color = detect_dominant_color(frame, box)
    if not color:
        return label

    return f"{color}_{parts[1]}"


def draw_corrected_results(frame, result) -> None:
    names = result.names
    boxes = result.boxes
    if boxes is None:
        return

    for box in boxes:
        cls_id = int(box.cls[0].item())
        confidence = float(box.conf[0].item())
        x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
        raw_label = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else names[cls_id]
        label = correct_label_color(frame, raw_label, (x1, y1, x2, y2))
        cv2.rectangle(frame, (x1, y1), (x2, y2), (30, 220, 80), 2)
        cv2.putText(
            frame,
            f"{label} {confidence:.2f}",
            (x1, max(18, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (30, 220, 80),
            1,
            cv2.LINE_AA,
        )


def main() -> int:
    args = parse_args()
    model_path = Path(args.model)
    if not model_path.exists():
        raise SystemExit(f"Model not found: {model_path}")

    model = YOLO(str(model_path))
    camera_source = normalize_camera_source(args.camera)
    cap = cv2.VideoCapture(camera_source)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open camera stream: {camera_source}")

    window_name = "YOLO ESP32-CAM Preview"
    print(f"Model: {model_path}")
    print(f"Camera: {camera_source}")
    print("Press q in the preview window to quit.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue

            frame = transform_frame(
                frame,
                rotate_180=args.rotate_180,
                flip_horizontal=args.flip_horizontal,
                flip_vertical=args.flip_vertical,
            )
            results = model.predict(frame, imgsz=args.imgsz, conf=args.conf, verbose=False)
            if args.color_correct:
                annotated = frame.copy()
                draw_corrected_results(annotated, results[0])
            else:
                annotated = results[0].plot()
            cv2.imshow(window_name, scale_for_display(annotated, args.display_scale))
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
