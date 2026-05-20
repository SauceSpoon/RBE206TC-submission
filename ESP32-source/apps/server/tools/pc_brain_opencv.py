#!/usr/bin/env python3
"""OpenCV detector client for the PC Brain final-run path.

The script reads an ESP32-CAM MJPEG stream, extracts simple color/shape
detections, and posts them to the Node server. It does not talk to the robot
controller directly.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

import cv2
import numpy as np


MODEL_CLASSES = ["cube", "ball", "pyramid"]
EXTERNAL_BRAIN_SCENES = {
    "first_yellow_ahead",
    "center_gate_visible",
    "black_goal_visible",
    "uncertain",
}
EXTERNAL_BRAIN_ACTIONS = {"forward", "turn_left", "turn_right", "stop", "none"}
DEFAULT_COLOR_RANGES = {
    "red": [((0, 90, 50), (10, 255, 255)), ((170, 90, 50), (180, 255, 255))],
    "blue": [((95, 80, 45), (130, 255, 255))],
    "green": [((40, 60, 45), (85, 255, 255))],
    "yellow": [((18, 80, 60), (38, 255, 255))],
    "black": [((0, 0, 0), (180, 255, 70))],
}
DEFAULT_HSV_CONFIG_PATH = Path(__file__).with_name("pc_brain_hsv.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ESP32-CAM OpenCV detector for PC Brain")
    parser.add_argument(
        "--camera",
        required=True,
        help="ESP32-CAM stream URL or IP. Use http://IP/stream for this repo firmware, or http://IP:81/stream for Arduino CameraWebServer.",
    )
    parser.add_argument("--server", default="http://127.0.0.1:3001", help="Node server base URL")
    parser.add_argument("--post-hz", type=float, default=5.0, help="Maximum vision POST frequency")
    parser.add_argument("--min-area", type=float, default=450.0, help="Minimum contour area in pixels")
    parser.add_argument(
        "--max-area-ratio",
        type=float,
        default=1.0,
        help="Reject contours larger than this fraction of the frame. Use values like 0.08 for table tests.",
    )
    parser.add_argument(
        "--reject-edge-boxes",
        action="store_true",
        help="Reject boxes touching the image edge, useful for ignoring laptop/table/background edges.",
    )
    parser.add_argument(
        "--shape-source",
        choices=("model", "contour"),
        default="model",
        help="Use the PyTorch model or contour geometry for shape labels when --shape-model is present.",
    )
    parser.add_argument("--display", action="store_true", help="Show annotated OpenCV preview")
    parser.add_argument("--no-post", action="store_true", help="Only run local preview/detection without posting vision results")
    parser.add_argument("--external-brain", action="store_true", help="Enable low-rate local VLM sidecar scene analysis via Ollama")
    parser.add_argument("--ollama-model", default="qwen3-vl:4b", help="Ollama vision model used when --external-brain is enabled")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434/api/generate", help="Ollama /api/generate endpoint")
    parser.add_argument("--external-brain-hz", type=float, default=1.0, help="Maximum local VLM sidecar analysis frequency")
    parser.add_argument("--external-brain-timeout", type=float, default=8.0, help="Ollama request timeout in seconds")
    parser.add_argument("--rotate-180", action="store_true", help="Rotate camera frames 180 degrees before detection")
    parser.add_argument("--flip-horizontal", action="store_true", help="Mirror camera frames horizontally before detection")
    parser.add_argument(
        "--shape-model",
        default="",
        help="Optional PyTorch shape model checkpoint. When provided, ROI shape classification uses this model instead of contour heuristics.",
    )
    parser.add_argument(
        "--calibrate",
        choices=sorted(DEFAULT_COLOR_RANGES),
        help="Open HSV trackbars for one color. Press s to save, q to quit.",
    )
    parser.add_argument(
        "--hsv-config",
        default=str(DEFAULT_HSV_CONFIG_PATH),
        help="HSV range JSON path used by detection and calibration.",
    )
    return parser.parse_args()


class ShapeModelClassifier:
    def __init__(self, model_path: str | Path) -> None:
        import torch
        from torch import nn

        self.torch = torch
        self.nn = nn
        checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
        self.classes = list(checkpoint.get("classes") or MODEL_CLASSES)
        self.image_size = int(checkpoint.get("image_size") or 96)
        self.model = self._build_model(len(self.classes))
        self.model.load_state_dict(checkpoint["model_state"])
        self.model.eval()

    def _build_model(self, num_classes: int):
        nn = self.nn
        class ShapeNet(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.features = nn.Sequential(
                    nn.Conv2d(3, 16, kernel_size=3, padding=1, bias=False),
                    nn.BatchNorm2d(16),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(2),
                    nn.Conv2d(16, 32, kernel_size=3, padding=1, bias=False),
                    nn.BatchNorm2d(32),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(2),
                    nn.Conv2d(32, 64, kernel_size=3, padding=1, bias=False),
                    nn.BatchNorm2d(64),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(2),
                    nn.Conv2d(64, 96, kernel_size=3, padding=1, bias=False),
                    nn.BatchNorm2d(96),
                    nn.ReLU(inplace=True),
                    nn.AdaptiveAvgPool2d((1, 1)),
                )
                self.classifier = nn.Sequential(
                    nn.Flatten(),
                    nn.Dropout(0.2),
                    nn.Linear(96, num_classes),
                )

            def forward(self, x):
                return self.classifier(self.features(x))

        return ShapeNet()

    def classify(self, frame: np.ndarray, box: tuple[int, int, int, int]) -> tuple[str, float]:
        x1, y1, x2, y2 = box
        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return "unknown", 0.0

        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (self.image_size, self.image_size), interpolation=cv2.INTER_AREA)
        tensor = self.torch.from_numpy(resized).float().permute(2, 0, 1).unsqueeze(0) / 255.0
        mean = self.torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        std = self.torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
        tensor = (tensor - mean) / std
        with self.torch.no_grad():
            probs = self.torch.softmax(self.model(tensor), dim=1).squeeze(0)
        index = int(probs.argmax().item())
        return self.classes[index], float(probs[index].item())


def apply_frame_rotation(frame: np.ndarray, rotate_180: bool = False) -> np.ndarray:
    return apply_frame_transform(frame, rotate_180=rotate_180)


def apply_frame_transform(
    frame: np.ndarray,
    rotate_180: bool = False,
    flip_horizontal: bool = False,
) -> np.ndarray:
    if rotate_180:
        frame = cv2.rotate(frame, cv2.ROTATE_180)
    if flip_horizontal:
        frame = cv2.flip(frame, 1)
    return frame


def normalize_range_tuple(value: object) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    lower, upper = value  # type: ignore[misc]
    lower_tuple = tuple(int(np.clip(component, 0, 255)) for component in lower)
    upper_tuple = tuple(int(np.clip(component, 0, 255)) for component in upper)
    return lower_tuple, upper_tuple  # type: ignore[return-value]


def serialize_color_ranges(color_ranges: dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]]) -> dict:
    return {
        color: [
            {
                "lower": list(lower),
                "upper": list(upper),
            }
            for lower, upper in ranges
        ]
        for color, ranges in color_ranges.items()
    }


def load_color_ranges(config_path: str | Path) -> dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]]:
    path = Path(config_path)
    if not path.exists():
        return {color: list(ranges) for color, ranges in DEFAULT_COLOR_RANGES.items()}

    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    color_ranges = {color: list(ranges) for color, ranges in DEFAULT_COLOR_RANGES.items()}
    for color, entries in payload.items():
        if color not in color_ranges or not isinstance(entries, list):
            continue
        parsed = []
        for entry in entries:
            if isinstance(entry, dict) and "lower" in entry and "upper" in entry:
                parsed.append(normalize_range_tuple((entry["lower"], entry["upper"])))
        if parsed:
            color_ranges[color] = parsed
    return color_ranges


def save_color_ranges(
    config_path: str | Path,
    color_ranges: dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]],
) -> None:
    path = Path(config_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(serialize_color_ranges(color_ranges), file, indent=2)
        file.write("\n")


def update_single_color_range(
    color_ranges: dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]],
    color: str,
    lower: tuple[int, int, int],
    upper: tuple[int, int, int],
) -> dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]]:
    next_ranges = {name: list(ranges) for name, ranges in color_ranges.items()}
    next_ranges[color] = [normalize_range_tuple((lower, upper))]
    return next_ranges


def mask_for_color(
    hsv: np.ndarray,
    color: str,
    color_ranges: dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]] | None = None,
) -> np.ndarray:
    ranges = color_ranges or DEFAULT_COLOR_RANGES
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in ranges[color]:
        mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(lower), np.array(upper)))
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask


def normalize_camera_url(value: str) -> str:
    source = value.strip()
    if source.startswith("http://") or source.startswith("https://"):
        return source
    if "/" in source:
        return "http://" + source
    return f"http://{source}/stream"


def classify_shape(contour: np.ndarray, color: str) -> str:
    area = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return "unknown"

    x, y, w, h = cv2.boundingRect(contour)
    aspect = h / max(w, 1)
    if color in {"black", "yellow"} and aspect >= 1.25:
        return "column"

    approx = cv2.approxPolyDP(contour, 0.04 * perimeter, True)
    circularity = 4.0 * np.pi * area / (perimeter * perimeter)
    if len(approx) == 3:
        return "pyramid"
    if len(approx) == 4:
        return "cube"
    if circularity >= 0.68:
        return "ball"
    return "ball" if circularity >= 0.52 else "unknown"


def expand_box(x: int, y: int, w: int, h: int, frame_width: int, frame_height: int, pad: float = 0.18) -> tuple[int, int, int, int]:
    pad_x = int(w * pad)
    pad_y = int(h * pad)
    return (
        max(0, x - pad_x),
        max(0, y - pad_y),
        min(frame_width, x + w + pad_x),
        min(frame_height, y + h + pad_y),
    )


def should_preserve_column_shape(color: str, shape: str) -> bool:
    return color in {"black", "yellow"} and shape == "column"


def touches_frame_edge(
    box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    margin: int = 3,
) -> bool:
    x, y, w, h = box
    return (
        x <= margin
        or y <= margin
        or x + w >= frame_width - margin
        or y + h >= frame_height - margin
    )


def detect(
    frame: np.ndarray,
    min_area: float,
    color_ranges: dict[str, list[tuple[tuple[int, int, int], tuple[int, int, int]]]] | None = None,
    shape_classifier: ShapeModelClassifier | None = None,
    max_area_ratio: float = 1.0,
    reject_edge_boxes: bool = False,
    shape_source: str = "model",
) -> list[dict]:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    frame_height, frame_width = frame.shape[:2]
    frame_area = frame_width * frame_height
    detections: list[dict] = []
    ranges = color_ranges or DEFAULT_COLOR_RANGES

    for color in ranges:
        mask = mask_for_color(hsv, color, ranges)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < min_area:
                continue
            if max_area_ratio < 1.0 and area > frame_area * max_area_ratio:
                continue

            x, y, w, h = cv2.boundingRect(contour)
            if reject_edge_boxes and touches_frame_edge((x, y, w, h), frame_width, frame_height):
                continue
            shape = classify_shape(contour, color)
            shape_confidence = None
            if shape_classifier and shape_source == "model" and not should_preserve_column_shape(color, shape):
                model_shape, model_confidence = shape_classifier.classify(
                    frame,
                    expand_box(x, y, w, h, frame_width, frame_height),
                )
                if model_shape != "unknown":
                    shape = model_shape
                    shape_confidence = round(float(model_confidence), 3)
            label = f"{color}_{shape}" if shape != "unknown" else color
            confidence = min(0.99, max(0.35, area / max(frame_width * frame_height * 0.12, 1)))
            detection = {
                "found": True,
                "color": color,
                "shape": shape,
                "label": label,
                "confidence": round(float(confidence), 3),
                "cx": int(x + w / 2),
                "cy": int(y + h / 2),
                "area": int(area),
                "frameWidth": int(frame_width),
                "frameHeight": int(frame_height),
                "box": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            }
            if shape_confidence is not None:
                detection["shapeConfidence"] = shape_confidence
                detection["confidence"] = shape_confidence
            detections.append(detection)

    detections.sort(key=lambda item: item["area"], reverse=True)
    return detections[:6]


def post_json(url: str, payload: dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=0.25) as response:
        response.read()


def encode_frame_jpeg_base64(frame: np.ndarray) -> str:
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
    if not ok:
        raise ValueError("failed to encode frame as JPEG")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def external_brain_prompt(detections: list[dict]) -> str:
    compact_detections = [
        {
            "label": detection.get("label"),
            "cx": detection.get("cx"),
            "cy": detection.get("cy"),
            "area": detection.get("area"),
            "frameWidth": detection.get("frameWidth"),
            "frameHeight": detection.get("frameHeight"),
        }
        for detection in detections[:6]
    ]
    return (
        "/no_think\n"
        "You are the sidecar scene judge for a small walking robot in a fixed obstacle course. "
        "The robot starts at the bottom and must follow a fixed route upward: bypass the first front yellow column on the right, "
        "then go through the middle gap between the second-row yellow columns, then touch the black column goal. "
        "Use the image and these OpenCV detections to classify the current scene. "
        f"OpenCV detections: {json.dumps(compact_detections, ensure_ascii=False)}. "
        "Return only JSON with exactly these keys: scene, confidence, suggestedAction, reason. "
        "scene must be one of: first_yellow_ahead, center_gate_visible, black_goal_visible, uncertain. "
        "suggestedAction must be one of: forward, turn_left, turn_right, stop, none. "
        "Use first_yellow_ahead when a yellow column blocks the front route near the center. "
        "Use center_gate_visible when two yellow columns form a passable middle gate. "
        "Use black_goal_visible when the black column goal is visible. "
        "Keep reason under 80 Chinese characters."
    )


def normalize_external_brain_result(result: object, model: str, latency_ms: int) -> dict:
    payload = result if isinstance(result, dict) else {}
    scene = str(payload.get("scene") or "uncertain").strip()
    action = str(payload.get("suggestedAction") or "none").strip()
    confidence = payload.get("confidence")
    if not isinstance(confidence, (int, float)):
        confidence = 0.0
    return {
        "model": model,
        "scene": scene if scene in EXTERNAL_BRAIN_SCENES else "uncertain",
        "confidence": round(float(max(0.0, min(1.0, confidence))), 3),
        "suggestedAction": action if action in EXTERNAL_BRAIN_ACTIONS else "none",
        "reason": str(payload.get("reason") or "")[:240],
        "latencyMs": latency_ms,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }


def analyze_external_brain(frame: np.ndarray, detections: list[dict], model: str, ollama_url: str, timeout: float) -> dict:
    started_at = time.monotonic()
    request_payload = {
        "model": model,
        "prompt": external_brain_prompt(detections),
        "images": [encode_frame_jpeg_base64(frame)],
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 160,
        },
    }
    data = json.dumps(request_payload).encode("utf-8")
    request = urllib.request.Request(
        ollama_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        ollama_response = json.loads(response.read().decode("utf-8"))
    raw_text = str(ollama_response.get("response") or ollama_response.get("thinking") or "{}").strip()
    try:
      parsed = json.loads(raw_text)
    except json.JSONDecodeError:
      parsed = {"scene": "uncertain", "confidence": 0, "suggestedAction": "none", "reason": raw_text[:120]}
    latency_ms = int((time.monotonic() - started_at) * 1000)
    return normalize_external_brain_result(parsed, model, latency_ms)


def draw(frame: np.ndarray, detections: list[dict]) -> None:
    for detection in detections:
        box = detection["box"]
        x, y, w, h = box["x"], box["y"], box["w"], box["h"]
        cv2.rectangle(frame, (x, y), (x + w, y + h), (30, 220, 80), 2)
        cv2.putText(
            frame,
            f'{detection["label"]} {detection["confidence"]:.2f}',
            (x, max(18, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (30, 220, 80),
            1,
            cv2.LINE_AA,
        )


def create_hsv_trackbars(window_name: str, lower: tuple[int, int, int], upper: tuple[int, int, int]) -> None:
    cv2.namedWindow(window_name)
    cv2.createTrackbar("LH", window_name, lower[0], 180, lambda _value: None)
    cv2.createTrackbar("LS", window_name, lower[1], 255, lambda _value: None)
    cv2.createTrackbar("LV", window_name, lower[2], 255, lambda _value: None)
    cv2.createTrackbar("UH", window_name, upper[0], 180, lambda _value: None)
    cv2.createTrackbar("US", window_name, upper[1], 255, lambda _value: None)
    cv2.createTrackbar("UV", window_name, upper[2], 255, lambda _value: None)


def read_hsv_trackbars(window_name: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    lower = (
        cv2.getTrackbarPos("LH", window_name),
        cv2.getTrackbarPos("LS", window_name),
        cv2.getTrackbarPos("LV", window_name),
    )
    upper = (
        cv2.getTrackbarPos("UH", window_name),
        cv2.getTrackbarPos("US", window_name),
        cv2.getTrackbarPos("UV", window_name),
    )
    return lower, upper


def run_calibration(
    cap: cv2.VideoCapture,
    color: str,
    config_path: str | Path,
    rotate_180: bool = False,
    flip_horizontal: bool = False,
) -> int:
    color_ranges = load_color_ranges(config_path)
    lower, upper = color_ranges[color][0]
    trackbar_window = f"HSV calibration: {color}"
    create_hsv_trackbars(trackbar_window, lower, upper)

    print("Calibration mode: press s to save the current HSV range, q to quit.")
    print(f"Saving to: {Path(config_path)}")

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.05)
            continue

        frame = apply_frame_transform(
            frame,
            rotate_180=rotate_180,
            flip_horizontal=flip_horizontal,
        )
        lower, upper = read_hsv_trackbars(trackbar_window)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        result = cv2.bitwise_and(frame, frame, mask=mask)

        preview = frame.copy()
        cv2.putText(
            preview,
            f"{color} lower={lower} upper={upper}",
            (10, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (30, 220, 80),
            2,
            cv2.LINE_AA,
        )
        cv2.imshow("PC Brain calibration live", preview)
        cv2.imshow("PC Brain calibration mask", mask)
        cv2.imshow("PC Brain calibration result", result)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("s"):
            color_ranges = update_single_color_range(color_ranges, color, lower, upper)
            save_color_ranges(config_path, color_ranges)
            print(f"Saved {color}: lower={lower}, upper={upper}")
        if key == ord("q"):
            break

    cv2.destroyAllWindows()
    return 0


def main() -> int:
    args = parse_args()
    camera_url = normalize_camera_url(args.camera)
    color_ranges = load_color_ranges(args.hsv_config)
    shape_classifier = ShapeModelClassifier(args.shape_model) if args.shape_model else None
    vision_url = args.server.rstrip("/") + "/api/pc-brain/vision"
    cap = cv2.VideoCapture(camera_url)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open camera stream: {camera_url}")

    if args.calibrate:
        try:
            return run_calibration(
                cap,
                args.calibrate,
                args.hsv_config,
                args.rotate_180,
                args.flip_horizontal,
            )
        finally:
            cap.release()

    frame_id = 0
    last_post_at = 0.0
    last_external_brain_at = 0.0
    last_external_brain: dict | None = None
    post_interval = 1.0 / max(args.post_hz, 0.1)
    external_brain_interval = 1.0 / max(args.external_brain_hz, 0.1)

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.05)
            continue

        frame = apply_frame_transform(
            frame,
            rotate_180=args.rotate_180,
            flip_horizontal=args.flip_horizontal,
        )
        frame_id += 1
        detections = detect(
            frame,
            args.min_area,
            color_ranges,
            shape_classifier=shape_classifier,
            max_area_ratio=args.max_area_ratio,
            reject_edge_boxes=args.reject_edge_boxes,
            shape_source=args.shape_source,
        )
        now = time.monotonic()
        if args.external_brain and now - last_external_brain_at >= external_brain_interval:
            try:
                last_external_brain = analyze_external_brain(
                    frame,
                    detections,
                    args.ollama_model,
                    args.ollama_url,
                    args.external_brain_timeout,
                )
            except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
                last_external_brain = {
                    "model": args.ollama_model,
                    "scene": "uncertain",
                    "confidence": 0,
                    "suggestedAction": "none",
                    "reason": f"外置大脑调用失败：{error}",
                    "latencyMs": None,
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                }
                print(f"external brain failed: {error}")
            last_external_brain_at = now

        if not args.no_post and now - last_post_at >= post_interval:
            payload = {
                "frameId": frame_id,
                "capturedAt": time.time(),
                "detections": detections,
            }
            if last_external_brain:
                payload["externalBrain"] = last_external_brain
            try:
                post_json(vision_url, payload)
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                print(f"vision post failed: {error}")
            last_post_at = now

        if args.display:
            draw(frame, detections)
            cv2.imshow("PC Brain OpenCV", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    if args.display:
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
