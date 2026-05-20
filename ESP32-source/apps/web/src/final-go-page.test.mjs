import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardConfig = await readFile(new URL('./dashboard-config.jsx', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const page = await readFile(new URL('./pages/FinalGoPage.jsx', import.meta.url), 'utf8');

const targetLabels = [
  'black_cube',
  'black_ball',
  'black_pyramid',
  'blue_cube',
  'blue_ball',
  'blue_pyramid',
  'green_cube',
  'green_ball',
  'green_pyramid',
  'red_cube',
  'red_ball',
  'red_pyramid'
];

test('final go page is registered as a dashboard tab', () => {
  assert.match(dashboardConfig, /id:\s*'final-go'/);
  assert.match(dashboardConfig, /label:\s*'Final go!'/);
  assert.match(app, /case 'final-go':/);
});

test('standalone camera page is not exposed in the dashboard', () => {
  assert.doesNotMatch(dashboardConfig, /id:\s*'camera'/);
  assert.doesNotMatch(dashboardConfig, /label:\s*'独立相机'/);
  assert.doesNotMatch(app, /import CameraPage/);
  assert.doesNotMatch(app, /case 'camera':/);
  assert.doesNotMatch(app, /<CameraPage/);
});

test('final go page exposes pc brain task controls without body autopilot controls', () => {
  for (const label of targetLabels) {
    assert.match(dashboardConfig, new RegExp(label));
  }

  assert.match(page, /<select/);
  assert.match(page, /当前目标/);
  assert.match(page, /Task1 自动路线/);
  assert.match(page, /Task1: 起步向上接近第一个黄柱/);
  assert.match(page, /Task1: 右绕第一个黄柱/);
  assert.match(page, /Task1: 从第二排两个黄柱中间穿过/);
  assert.match(page, /Task1: 触碰黑色终点柱/);
  assert.match(page, /Task2 触碰目标/);
  assert.doesNotMatch(page, /本体 Task1/);
  assert.doesNotMatch(page, /本体 Task2/);
  assert.doesNotMatch(page, /停止本体模式/);
  assert.doesNotMatch(page, /vision_autopilot/);
  assert.match(page, /submitPcBrainAction\('start', 'task1'\)/);
  assert.match(page, /submitPcBrainAction\('start', 'task2'\)/);
  assert.doesNotMatch(page, /占位/);
  assert.doesNotMatch(page, /旧版 Final Go/);
  assert.match(page, /\/api\/pc-brain\/start/);
  assert.match(page, /\/api\/pc-brain\/stop/);
});

test('final go page shows the live camera view only for task1', () => {
  assert.match(app, /cameraSnapshotProxyUrl=\{cameraSnapshotProxyUrl\}/);
  assert.match(app, /liveStreamUrl=\{liveStreamUrl\}/);
  assert.match(page, /cameraSnapshotProxyUrl/);
  assert.match(page, /showTask1CameraPreview = !isTask2/);
  assert.match(page, /showTask1CameraPreview \?/);
  assert.match(page, /Task1 视角/);
  assert.match(page, /Task1 摄像头实时画面/);
  assert.match(page, /final-camera-panel/);
  assert.match(page, /appendCacheBuster/);
  assert.doesNotMatch(page, /PC Brain 视角/);
});

test('final go page includes robot and camera connection controls', () => {
  assert.match(dashboardConfig, /ip:\s*'192\.168\.10\.11'/);
  assert.match(app, /ip=\{ip\}/);
  assert.match(app, /setIp=\{setIp\}/);
  assert.match(app, /cameraForm=\{cameraForm\}/);
  assert.match(app, /updateCameraForm=\{updateCameraForm\}/);
  assert.match(app, /handleConnect=\{handleConnect\}/);
  assert.match(app, /handleCameraConnect=\{handleCameraConnect\}/);
  assert.match(app, /cameraConnectError=\{cameraConnectError\}/);
  assert.match(app, /setDashboard\(\(current\) => \(\{/);
  assert.match(page, /比赛连接/);
  assert.match(page, /机器人 IP/);
  assert.match(page, /相机 IP/);
  assert.match(page, /连接机器人/);
  assert.match(page, /连接相机/);
  assert.match(page, /cameraConnectError/);
  assert.match(page, /final-connect-panel/);
});

test('camera connection is only driven by the final go manual camera IP control', () => {
  assert.doesNotMatch(app, /AUTO_CAMERA_IP/);
  assert.doesNotMatch(app, /AUTO_CAMERA_RETRY_MS/);
  assert.doesNotMatch(app, /自动连接相机/);
});

test('final go page displays Otto IMU yaw diagnostics without implying active correction', () => {
  assert.match(dashboardConfig, /ottoStraightDiagnosticAvailable:\s*false/);
  assert.match(app, /gaitTelemetry=\{gaitTelemetry\}/);
  assert.match(page, /gaitTelemetry/);
  assert.match(page, /IMU 直行诊断/);
  assert.match(page, /CollapsibleInfoSection/);
  assert.match(page, /aria-expanded=\{open\}/);
  assert.match(page, /final-status-section-toggle/);
  assert.match(page, /externalBrain:\s*false/);
  assert.match(page, /ultrasonic:\s*false/);
  assert.match(page, /imu:\s*false/);
  assert.match(page, /超声波测试/);
  assert.match(page, /外置大脑判断/);
  assert.match(page, /模型场景/);
  assert.match(page, /建议动作/);
  assert.match(page, /判断原因/);
  assert.match(page, /中置距离/);
  assert.match(page, /中置状态/);
  assert.match(app, /ultrasonic=\{dashboard\.ultrasonic \|\| defaultState\.ultrasonic\}/);
  assert.match(page, /当前 yaw/);
  assert.match(page, /起步 yaw/);
  assert.match(page, /偏航角/);
  assert.match(page, /最大偏航/);
  assert.match(page, /纠偏状态/);
  assert.match(page, /仅监测/);
  assert.match(page, /if \(value === 'left'\) return '左偏 \/ \+'/);
  assert.match(page, /if \(value === 'right'\) return '右偏 \/ -'/);
});

test('final go page provides gated keyboard teleop for observing Qwen suggestions', () => {
  assert.match(app, /manualCommand=\{postControlCommand\}/);
  assert.match(app, /activePage === 'final-go'/);
  assert.match(page, /键盘遥控/);
  assert.match(page, /keyboardTeleopEnabled/);
  assert.match(page, /启用键盘控制/);
  assert.match(page, /关闭键盘控制/);
  assert.match(page, /manualCommand/);
  assert.match(page, /q:\s*\{ type: 'move', direction: 'otto_left', speed: 40 \}/);
  assert.match(page, /e:\s*\{ type: 'move', direction: 'otto_right', speed: 40 \}/);
  assert.match(page, /W 同步直行/);
  assert.match(page, /S 同步后退/);
  assert.match(page, /Q 左转/);
  assert.match(page, /E 右转/);
  assert.match(page, /Space 急停/);
});
