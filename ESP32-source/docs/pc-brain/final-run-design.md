# PC Brain Final Run Design

## Goal

Add a parallel local-computer brain path without deleting or replacing the existing ESP32-side and manual Web control paths.

The PC Brain path is used for the automated teacher-facing flow:

1. Connect the robot controller.
2. Connect the ESP32-CAM.
3. Select the target object.
4. Start PC Brain.
5. The computer reads camera detections, decides the task phase, sends motion commands, and stops automatically.

## Architecture

```text
ESP32-CAM
  -> Python OpenCV detector on the computer
  -> Node PC Brain endpoint
  -> FinalRunManager task state machine
  -> RobotManager / SimulationManager
  -> ESP32 robot controller
```

The original manual control page continues to use `/api/control`. The new PC Brain path uses `/api/pc-brain/*` and only sends robot commands after `/api/pc-brain/start` has been called.

## Responsibilities

- ESP32-CAM: video capture only.
- Python detector: OpenCV frame reading, HSV segmentation, contour extraction, detection JSON posting.
- Node PC Brain: run state, input validation, activity timeout metadata, forwarding detections to FinalRunManager.
- FinalRunManager: competition phase logic and robot motion commands.
- ESP32 robot controller: execute commands, keep OTA/manual control capability, enforce board-side safety timeout.

## Isolation Rules

- Existing code and docs remain in place.
- PC Brain starts stopped by default.
- Vision events posted while PC Brain is stopped are recorded as ignored and do not command the robot.
- Manual Web control remains available when PC Brain is stopped.
- Emergency stop is always allowed.
- If PC Brain is running, ordinary manual movement should be treated as a mode conflict unless the operator stops PC Brain first.

## First Implementation Slice

- Add a `pcBrain` state block to the server snapshot.
- Add a `PcBrainManager` with `start`, `stop`, and `applyVision`.
- Add `/api/pc-brain/start`, `/api/pc-brain/stop`, `/api/pc-brain/vision`, and `/api/pc-brain/status`.
- Add a Python detector client skeleton that reads ESP32-CAM frames and posts detections to the Node service.

## Operator Flow

1. Start the Node server and Web console.
2. Connect the robot controller and ESP32-CAM from the Web console.
3. If the lighting changed, calibrate each color before the run:

```bash
python3 apps/server/tools/pc_brain_opencv.py \
  --camera http://ESP32_CAM_IP/stream \
  --calibrate red
```

Use the HSV sliders until the mask isolates the target color. Press `s` to save the current range to `apps/server/tools/pc_brain_hsv.json`, then press `q` to quit. Repeat for `blue`, `green`, `yellow`, and `black` as needed.

4. Start the Python detector:

```bash
python3 apps/server/tools/pc_brain_opencv.py \
  --camera http://ESP32_CAM_IP/stream \
  --server http://127.0.0.1:3001 \
  --shape-model camera识别模型/esp32cam_touch_bot/models/shape_classifier_v3_live_hard/best.pt \
  --rotate-180 \
  --flip-horizontal \
  --display
```

If the camera is running the Arduino `CameraWebServer` reference sketch, use:

```bash
python3 apps/server/tools/pc_brain_opencv.py \
  --camera http://ESP32_CAM_IP:81/stream \
  --server http://127.0.0.1:3001 \
  --shape-model camera识别模型/esp32cam_touch_bot/models/shape_classifier_v3_live_hard/best.pt \
  --rotate-180 \
  --flip-horizontal \
  --display
```

With `--shape-model`, color is still detected by HSV, but cube/ball/pyramid shape comes from the trained PyTorch model. If the option is omitted, the detector falls back to contour shape heuristics.

5. In the Final Go page, choose the target and click `PC Brain 自动开始`.
6. The detector posts vision frames to `/api/pc-brain/vision`; the server decides and sends movement commands.
7. Click `停止 PC Brain` or the normal emergency stop if the run must be interrupted.

## Rollback

This is additive. To return to the previous workflow, stop PC Brain and keep using the existing Web control page, camera page, and Final Go page.
