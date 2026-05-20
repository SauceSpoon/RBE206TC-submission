#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/dataset/yolo_objects_v1/data.yaml')
    parser.add_argument('--model', default='yolo11n.pt')
    parser.add_argument('--epochs', type=int, default=80)
    parser.add_argument('--imgsz', type=int, default=416)
    parser.add_argument('--batch', type=int, default=8)
    parser.add_argument('--project', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/models/yolo_detector')
    parser.add_argument('--name', default='yolo11n_objects_v1')
    parser.add_argument('--device', default='cpu')
    args = parser.parse_args()

    model = YOLO(args.model)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=args.project,
        name=args.name,
        device=args.device,
        workers=0,
        patience=20,
        seed=42,
        exist_ok=True,
        close_mosaic=10,
        degrees=10,
        translate=0.12,
        scale=0.35,
        fliplr=0.5,
        hsv_h=0.015,
        hsv_s=0.35,
        hsv_v=0.25,
    )
    run_dir = Path(results.save_dir)
    best = run_dir / 'weights' / 'best.pt'
    print(f'RUN_DIR={run_dir}')
    print(f'BEST={best}')

    metrics = model.val(data=args.data, imgsz=args.imgsz, batch=args.batch, device=args.device, workers=0)
    print(metrics)


if __name__ == '__main__':
    main()
