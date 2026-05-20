import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const visionPipeline = readFileSync(new URL('./VisionPipeline.cpp', import.meta.url), 'utf8');

test('camera config is value-initialized before fields are assigned', () => {
  assert.match(
    visionPipeline,
    /camera_config_t\s+config\s*=\s*\{\s*\};/,
    'camera_config_t must be zero-initialized so driver-only fields are deterministic'
  );
});

test('default sensor setup uses automatic exposure, gain, and white balance', () => {
  assert.match(visionPipeline, /set_whitebal\(s,\s*1\)/);
  assert.match(visionPipeline, /set_awb_gain\(s,\s*1\)/);
  assert.match(visionPipeline, /set_exposure_ctrl\(s,\s*1\)/);
  assert.match(visionPipeline, /set_gain_ctrl\(s,\s*1\)/);
  assert.doesNotMatch(visionPipeline, /set_exposure_ctrl\(s,\s*0\)/);
  assert.doesNotMatch(visionPipeline, /set_gain_ctrl\(s,\s*0\)/);
});

test('camera captures QVGA frames to match the training photo resolution', () => {
  const frameSizeMatches = visionPipeline.match(/config\.frame_size\s*=\s*(FRAMESIZE_[A-Z0-9_]+)/g) || [];
  assert.ok(frameSizeMatches.length >= 1, 'camera frame size must be assigned');

  for (const assignment of frameSizeMatches) {
    assert.match(assignment, /FRAMESIZE_QVGA/, 'model camera should capture 320x240 QVGA frames');
  }
});

test('camera emits one clean vision JSON line for the robot controller', () => {
  const sketch = readFileSync(new URL('./esp32cam_touch_bot.ino', import.meta.url), 'utf8');

  assert.match(sketch, /void sendVisionSerial\(const DetectionResult& d\)/);
  assert.match(sketch, /\\"type\\":\\"vision\\"/);
  assert.match(sketch, /\\"frameWidth\\":/);
  assert.match(sketch, /\\"frameHeight\\":/);
  assert.match(sketch, /sendVisionSerial\(d\);/);
  assert.match(sketch, /const int frameWidth = d\.frameW > 0 \? d\.frameW : 320;/);
  assert.doesNotMatch(sketch, /const int frameWidth = 160/);
});
