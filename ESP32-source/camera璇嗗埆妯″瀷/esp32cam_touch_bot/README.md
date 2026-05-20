# ESP32-CAM Touch Bot Framework

This is a starter framework for the competition flow:

1. Draw target (color + shape)
2. Camera scans candidates
3. Robot aligns to target
4. Robot approaches and touches target

## Files

- esp32cam_touch_bot.ino: main state machine
- Config.h: pins and thresholds
- VisionPipeline.*: camera + color/shape detection
- ShapeClassifier.*: placeholder shape classifier (replace by model)
- MotorControl.*: simple motor driver wrapper

## How to use

1. Open `esp32cam_touch_bot` folder in Arduino IDE.
2. Select board: `AI Thinker ESP32-CAM`.
3. Install ESP32 board package in Board Manager if needed.
4. Confirm motor pins in Config.h.
5. Set your draw target in Config.h:

```cpp
constexpr TargetSpec TARGET = {ColorId::RED, ShapeId::PYRAMID};
```

6. Upload and open serial monitor at 115200.

## Image collection first

Before model training, complete image collection with the dedicated guide:

- IMAGE_COLLECTION.md

Batch capture script:

- tools/capture_dataset.sh
- tools/collect_12_classes.sh
- tools/audit_dataset.sh
- tools/prepare_photodata.sh
- tools/prepare_shape_model_dataset.sh

Competition classes:

- colors: black, blue, green, red
- shapes: cube, ball, pyramid
- total: 12 labels, e.g. black_cube, blue_ball, red_pyramid

Quick example:

```bash
chmod +x tools/capture_dataset.sh
./tools/capture_dataset.sh -i 192.168.1.88 -l red_cube -n 300 -o dataset/raw -t 0.35
./tools/collect_12_classes.sh -i 192.168.1.88 -n 250 -o dataset/raw -t 0.35
./tools/audit_dataset.sh -d dataset/raw -m 250
./tools/prepare_photodata.sh --clean
./tools/prepare_shape_model_dataset.sh --clean
./tools/prepare_shape_model_dataset.sh --clean -o dataset/shape_model_balanced --max-per-shape 365
```

## Next step: replace shape classifier with Edge Impulse

In `ShapeClassifier.cpp`, replace `classifyShapeHeuristic(...)` with model inference result mapping.

Train the first model from `dataset/shape_model_balanced`:

- input: cropped object image
- outputs: cube, ball, pyramid
- recommended input size: 64x64 or 96x96 RGB
- deployment target: int8 Arduino library

Local PyTorch baseline:

```bash
/Users/yanyangnan/miniforge3/bin/python tools/train_shape_model.py \
  --data-dir dataset/shape_model_balanced \
  --out-dir models/shape_classifier \
  --image-size 96 \
  --epochs 50 \
  --batch-size 32
```

Current baseline result:

- best validation accuracy: 97.26%
- best epoch: 45
- outputs: models/shape_classifier/best.pt, best_torchscript.pt, metrics.json

Robust v2 training for imperfect ROI crops:

```bash
/Users/yanyangnan/miniforge3/bin/python tools/train_shape_model.py \
  --data-dir dataset/shape_model \
  --out-dir models/shape_classifier_v2_full_hard \
  --image-size 96 \
  --epochs 50 \
  --batch-size 32 \
  --aug-profile hard \
  --balanced-sampler \
  --class-weighted-loss
```

Current v2 result:

- best validation accuracy: 92.59%
- best epoch: 44
- outputs: models/shape_classifier_v2_full_hard/best.pt, best_torchscript.pt, metrics.json
- composite test detections: 88, down from 95 with the first model
- practical note: v2 is less overconfident on single-object validation and improves red cube behavior in composite scenes

Composite-scene test:

```bash
/Users/yanyangnan/miniforge3/bin/python tools/test_composite_photos.py \
  --image-dir ../照片/组合 \
  --model models/shape_classifier_v2_full_hard/best.pt \
  --out-dir models/shape_classifier_v2_full_hard/composite_test_strict
```

Live camera test before Arduino deployment:

```bash
# ESP32-CAM CameraWebServer capture endpoint
/Users/yanyangnan/miniforge3/bin/python tools/live_camera_test.py \
  --esp32-ip 192.168.1.88 \
  --target red_cube \
  --frames 0

# USB camera or Mac camera
/Users/yanyangnan/miniforge3/bin/python tools/live_camera_test.py \
  --source 0 \
  --target red_cube \
  --frames 0
```

Hard-example collection from the live ESP32-CAM view:

```bash
/Users/yanyangnan/miniforge3/bin/python tools/live_camera_test.py \
  --esp32-ip 172.20.10.2 \
  --focus-color red \
  --frames 0 \
  --display \
  --collect-dir dataset/live_hard_shape_rois
```

When the displayed ROI is wrong, press the true shape key:

- `c`: choose cube
- `b`: choose ball
- `p`: choose pyramid
- `Enter`: confirm and save the shown ROI
- `Esc`: cancel the pending label
- `q`: quit

Use `--focus-color` to collect one object color at a time. For example, use `--focus-color red` when collecting red cube failure cases, and keep only that target object under the camera.

Task1 marker and boundary calibration images:

```bash
./tools/collect_competition_markers.sh -i 172.20.10.11 -n 150 -o dataset/competition_markers -t 0.35
```

This collects raw images into:

- `yellow_column`: yellow obstacle columns
- `black_column`: the black goal column only
- `black_boundary_line`: boundary line without the goal column
- `background_negative`: floor, shadows, empty scene, and robot body negatives

Use these buckets first for HSV threshold tuning. Train a model only if color rules are not stable enough under competition lighting.

After collecting hard examples, build and train v3:

```bash
./tools/prepare_v3_shape_dataset.sh --clean

/Users/yanyangnan/miniforge3/bin/python tools/train_shape_model.py \
  --data-dir dataset/shape_model_v3_live_hard \
  --out-dir models/shape_classifier_v3_live_hard \
  --image-size 96 \
  --epochs 50 \
  --batch-size 32 \
  --aug-profile hard \
  --balanced-sampler \
  --class-weighted-loss
```

Suggested mapping:

- model output index 0 -> ShapeId::CUBE
- model output index 1 -> ShapeId::BALL
- model output index 2 -> ShapeId::PYRAMID

## Notes

- This version keeps logic light for ESP32-CAM.
- HSV ranges may need tuning for your lighting.
- For better reliability, keep white balance/exposure fixed.
