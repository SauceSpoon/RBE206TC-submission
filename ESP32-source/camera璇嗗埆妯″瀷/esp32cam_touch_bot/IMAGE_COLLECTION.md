# ESP32-CAM Image Collection Guide

This guide helps you pass the data collection stage reliably before model training.

## 1. Goal

Collect images for your own classes:

- 4 colors x 3 shapes = 12 labels
- Example labels:
  - black_cube, black_ball, black_pyramid
  - blue_cube, blue_ball, blue_pyramid
  - green_cube, green_ball, green_pyramid
  - red_cube, red_ball, red_pyramid

Minimum target:

- 250 to 300 images per class
- total 3000 to 3600 images

## 2. Flash CameraWebServer (for capture endpoint)

In Arduino IDE:

1. Open Examples -> ESP32 -> Camera -> CameraWebServer
2. Set board to AI Thinker ESP32-CAM
3. In code:
   - set camera model to AI Thinker
   - fill Wi-Fi SSID and password
4. Enter download mode (IO0 -> GND), upload firmware, then reboot
5. Open Serial Monitor (115200) and read camera IP

When successful, you should see a URL like:

- http://192.168.x.x

The endpoint used for batch capture is:

- http://192.168.x.x/capture

## 3. Prepare folders

From project root:

- mkdir -p dataset/raw

## 4. Batch capture with script

This repo includes:

- tools/capture_dataset.sh
- tools/collect_12_classes.sh
- tools/audit_dataset.sh
- tools/prepare_photodata.sh
- tools/prepare_shape_model_dataset.sh

Make it executable once:

- chmod +x tools/capture_dataset.sh

Capture one class example:

- ./tools/capture_dataset.sh -i 192.168.1.88 -l red_cube -n 300 -o dataset/raw -t 0.35

Collect all 12 classes interactively:

- ./tools/collect_12_classes.sh -i 192.168.1.88 -n 250 -o dataset/raw -t 0.35

Audit whether all classes reach your target count:

- ./tools/audit_dataset.sh -d dataset/raw -m 250

Normalize the existing manually captured folders:

- ./tools/prepare_photodata.sh --clean

Build the 3-class shape training dataset:

- ./tools/prepare_shape_model_dataset.sh --clean

Build a balanced shape dataset for the first Edge Impulse run:

- ./tools/prepare_shape_model_dataset.sh --clean -o dataset/shape_model_balanced --max-per-shape 365

Meaning:

- -i: ESP32 IP
- -l: class label
- -n: image count
- -o: output root directory
- -t: time gap between frames (seconds)

## 5. Recommended collection protocol

For each class, split your 300 images by condition:

- 80 images: front view, center
- 80 images: rotated and tilted
- 80 images: different distance and position
- 60 images: clutter / partial occlusion / hard light

Do this under at least 2 lighting conditions.

## 6. Quality checklist (must pass)

Before training, quickly inspect each class folder:

1. No blurry burst set (remove obvious blur)
2. No wrong class images
3. Background is diverse (not one desk only)
4. Object scale varies (near and far)
5. Pose varies (upright, side, tilt)

If a class performs badly later, first check dataset quality, not model settings.

## 7. Suggested next step after collection

1. Split train/validation (80/20)
2. Start with shape model (3 classes) using color-filtered ROI
3. Keep color as HSV rule-based on-device

This gives faster and more stable deployment on ESP32-CAM.
