#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/models/yolo_detector/yolo11n_objects_v1/weights/best.pt')
    parser.add_argument('--source', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/照片/组合')
    parser.add_argument('--out', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/models/yolo_detector/yolo11n_objects_v1/composite_test')
    parser.add_argument('--conf', type=float, default=0.25)
    parser.add_argument('--imgsz', type=int, default=416)
    args = parser.parse_args()

    model = YOLO(args.model)
    source = Path(args.source)
    out = Path(args.out)
    ann_dir = out / 'annotated'
    ann_dir.mkdir(parents=True, exist_ok=True)
    rows = []

    imgs = sorted([p for p in source.rglob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png'}])
    for p in imgs:
        results = model.predict(source=str(p), imgsz=args.imgsz, conf=args.conf, verbose=False)
        r = results[0]
        names = r.names
        img = cv2.imread(str(p))
        dets = []
        if r.boxes is not None:
            for box in r.boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                label = names[cls_id]
                dets.append(f'{label}:{conf:.2f}')
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.putText(img, f'{label} {conf:.2f}', (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
        cv2.imwrite(str(ann_dir / p.name), img)
        rows.append(f'{p.name}: {", ".join(dets) if dets else "none"}')

    (out / 'predictions.txt').write_text('\n'.join(rows) + '\n')
    print(f'wrote {ann_dir}')
    print(f'wrote {out / "predictions.txt"}')


if __name__ == '__main__':
    main()
