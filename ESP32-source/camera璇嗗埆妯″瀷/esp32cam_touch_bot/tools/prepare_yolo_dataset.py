#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import random
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
import yaml

CLASSES = [
    'black_ball', 'black_cube', 'black_pyramid',
    'blue_ball', 'blue_cube', 'blue_pyramid',
    'green_ball', 'green_cube', 'green_pyramid',
    'red_ball', 'red_cube', 'red_pyramid',
]
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}
COLORS = {'black', 'blue', 'green', 'red'}
SHAPES = {'ball', 'cube', 'pyramid'}


def normalize_shape(text: str) -> str | None:
    text = text.lower()
    if 'ball' in text:
        return 'ball'
    if 'cube' in text:
        return 'cube'
    if 'pyramid' in text or 'triangle' in text or 'triange' in text:
        return 'pyramid'
    return None


def infer_class(path: Path, photodata_root: Path) -> str | None:
    folder = path.parent.name.lower().replace('-', ' ').replace('_', ' ')
    filename = path.stem.lower().replace('-', '_').replace(' ', '_')
    color = next((c for c in COLORS if re.search(rf'(^|[_\s]){c}([_\s]|$)', folder) or re.search(rf'(^|_){c}(_|$)', filename)), None)
    shape = normalize_shape(folder) or normalize_shape(filename)

    if path.parent.name.lower() == 'pyramid':
        shape = 'pyramid'
        color = next((c for c in COLORS if re.search(rf'(^|_){c}_pyramid', filename)), color)

    if color and shape:
        label = f'{color}_{shape}'
        if label in CLASS_TO_ID:
            return label
    return None


def color_mask(bgr: np.ndarray, color: str) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    if color == 'red':
        mask = (((h <= 12) | (h >= 168)) & (s >= 35) & (v >= 35)).astype(np.uint8) * 255
    elif color == 'blue':
        mask = ((h >= 85) & (h <= 135) & (s >= 35) & (v >= 35)).astype(np.uint8) * 255
    elif color == 'green':
        mask = ((h >= 35) & (h <= 95) & (s >= 30) & (v >= 35)).astype(np.uint8) * 255
    elif color == 'black':
        # Black objects sit on a light table; keep dark, low/medium saturation regions.
        mask = ((v <= 95) & (s <= 210)).astype(np.uint8) * 255
    else:
        mask = np.zeros(bgr.shape[:2], dtype=np.uint8)

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return mask


def bbox_from_mask(mask: np.ndarray, img_shape: tuple[int, int, int], pad_ratio: float = 0.08) -> tuple[int, int, int, int] | None:
    h, w = mask.shape[:2]
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    min_area = max(20, int(w * h * 0.002))
    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if bw < 4 or bh < 4:
            continue
        candidates.append((area, x, y, bw, bh))

    if not candidates:
        return None

    # Merge major components so balls/cubes with highlights or pyramids split by shade remain one box.
    max_area = max(a for a, *_ in candidates)
    major = [(x, y, bw, bh) for a, x, y, bw, bh in candidates if a >= max_area * 0.18]
    xs = [x for x, _, bw, _ in major] + [x + bw for x, _, bw, _ in major]
    ys = [y for _, y, _, bh in major] + [y + bh for _, y, _, bh in major]
    x1, x2 = min(xs), max(xs)
    y1, y2 = min(ys), max(ys)

    pad = int(max(x2 - x1, y2 - y1) * pad_ratio)
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w - 1, x2 + pad)
    y2 = min(h - 1, y2 + pad)
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def fallback_bbox(bgr: np.ndarray) -> tuple[int, int, int, int]:
    h, w = bgr.shape[:2]
    return int(w * 0.08), int(h * 0.08), int(w * 0.92), int(h * 0.92)


def yolo_line(cls_id: int, box: tuple[int, int, int, int], w: int, h: int) -> str:
    x1, y1, x2, y2 = box
    xc = ((x1 + x2) / 2) / w
    yc = ((y1 + y2) / 2) / h
    bw = (x2 - x1) / w
    bh = (y2 - y1) / h
    vals = [cls_id, xc, yc, bw, bh]
    return f'{vals[0]} {vals[1]:.6f} {vals[2]:.6f} {vals[3]:.6f} {vals[4]:.6f}\n'


def link_or_copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def draw_label(src: Path, dst: Path, label: str, box: tuple[int, int, int, int]) -> None:
    img = cv2.imread(str(src))
    if img is None:
        return
    x1, y1, x2, y2 = box
    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 255), 2)
    cv2.putText(img, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), img)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/照片/photodata')
    parser.add_argument('--out', default='/Users/yanyangnan/Desktop/ESP32/camera识别模型/esp32cam_touch_bot/dataset/yolo_objects_v1')
    parser.add_argument('--val-ratio', type=float, default=0.2)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--qa-count', type=int, default=96)
    args = parser.parse_args()

    source = Path(args.source)
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)

    images = sorted([p for p in source.rglob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png'}])
    by_class: dict[str, list[Path]] = defaultdict(list)
    skipped = []
    for p in images:
        label = infer_class(p, source)
        if label is None:
            skipped.append(str(p))
            continue
        by_class[label].append(p)

    rng = random.Random(args.seed)
    splits: list[tuple[str, str, Path]] = []
    for label, paths in by_class.items():
        paths = paths[:]
        rng.shuffle(paths)
        val_n = max(1, int(round(len(paths) * args.val_ratio))) if len(paths) >= 5 else max(0, len(paths) // 5)
        for p in paths[:val_n]:
            splits.append(('val', label, p))
        for p in paths[val_n:]:
            splits.append(('train', label, p))

    stats = Counter()
    fallback_count = 0
    records_for_qa = []
    for split, label, src in splits:
        cls_id = CLASS_TO_ID[label]
        color = label.split('_', 1)[0]
        bgr = cv2.imread(str(src))
        if bgr is None:
            skipped.append(str(src))
            continue
        h, w = bgr.shape[:2]
        box = bbox_from_mask(color_mask(bgr, color), bgr.shape)
        if box is None:
            box = fallback_bbox(bgr)
            fallback_count += 1

        safe_name = f'{label}__{src.stem}{src.suffix.lower()}'
        img_dst = out / 'images' / split / safe_name
        lbl_dst = out / 'labels' / split / f'{Path(safe_name).stem}.txt'
        link_or_copy(src, img_dst)
        lbl_dst.parent.mkdir(parents=True, exist_ok=True)
        lbl_dst.write_text(yolo_line(cls_id, box, w, h))
        stats[(split, label)] += 1
        records_for_qa.append((src, label, box))

    yaml_data = {
        'path': str(out),
        'train': 'images/train',
        'val': 'images/val',
        'names': {i: name for i, name in enumerate(CLASSES)},
    }
    (out / 'data.yaml').write_text(yaml.safe_dump(yaml_data, allow_unicode=True, sort_keys=False))
    (out / 'classes.txt').write_text('\n'.join(CLASSES) + '\n')

    rng.shuffle(records_for_qa)
    for idx, (src, label, box) in enumerate(records_for_qa[:args.qa_count]):
        draw_label(src, out / 'qa_autolabel' / f'{idx:03d}_{label}_{src.name}', label, box)

    print(f'images input: {len(images)}')
    print(f'images labeled: {sum(stats.values())}')
    print(f'skipped: {len(skipped)}')
    print(f'fallback boxes: {fallback_count}')
    for cls in CLASSES:
        print(f'{cls:14s} train={stats[("train", cls)]:4d} val={stats[("val", cls)]:4d}')
    print(f'data yaml: {out / "data.yaml"}')
    print(f'QA images: {out / "qa_autolabel"}')


if __name__ == '__main__':
    main()
