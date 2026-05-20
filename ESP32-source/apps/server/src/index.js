import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { StateStore } from './state-store.js';
import { RobotManager } from './robot-manager.js';
import { flashFirmwareOverOta, flashFirmwareOverUsb } from './flashers.js';
import { SerialScanner } from './serial-scanner.js';
import { GaitOptimizer } from './gait-optimizer.js';
import { CameraManager } from './camera-manager.js';
import { ScriptRunner } from './script-runner.js';
import { planRobotScriptWithOllama } from './llm-client.js';
import { SimulationManager } from './sim-robot-manager.js';
import { FinalRunManager } from './final-run-manager.js';
import { PcBrainManager } from './pc-brain-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(rootDir, '.env'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3001);
const UPLOAD_DIR = path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads');
const OTA_ENDPOINT_PATH = process.env.OTA_ENDPOINT_PATH || '/update';
const CAMERA_OTA_ENDPOINT_PATH = process.env.CAMERA_OTA_ENDPOINT_PATH || '/update';
const ROBOT_STATUS_ENDPOINT = process.env.ROBOT_STATUS_ENDPOINT || '/status';
const ROBOT_CONTROL_ENDPOINT = process.env.ROBOT_CONTROL_ENDPOINT || '/control';
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 5000);
const CAMERA_POLL_INTERVAL_MS = Number(process.env.CAMERA_POLL_INTERVAL_MS || 5000);
const SERIAL_SCAN_INTERVAL_MS = Number(process.env.SERIAL_SCAN_INTERVAL_MS || 2000);
const USB_FLASH_BAUD_RATE = Number(process.env.USB_FLASH_BAUD_RATE || 921600);
const ESPTOOL_WRITE_OFFSET = process.env.ESPTOOL_WRITE_OFFSET || '0x10000';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const store = new StateStore();
const robotManager = new RobotManager(store, {
  wsPath: '/ws',
  statusPath: ROBOT_STATUS_ENDPOINT,
  controlPath: ROBOT_CONTROL_ENDPOINT,
  pingIntervalMs: PING_INTERVAL_MS
});
const simulationManager = new SimulationManager(store);
const controlTarget = {
  isConnected() {
    return simulationManager.isConnected() || robotManager.isConnected();
  },
  async sendCommand(command, options) {
    if (simulationManager.isConnected()) {
      return simulationManager.sendCommand(command, options);
    }

    return robotManager.sendCommand(command, options);
  }
};
const serialScanner = new SerialScanner(store, {
  intervalMs: SERIAL_SCAN_INTERVAL_MS
});
const gaitOptimizer = new GaitOptimizer(store, controlTarget);
const cameraManager = new CameraManager(store, {
  pollIntervalMs: CAMERA_POLL_INTERVAL_MS
});
const scriptRunner = new ScriptRunner(store, robotManager);
const finalRunManager = new FinalRunManager(store, {
  controlTarget
});
const pcBrainManager = new PcBrainManager(store, {
  finalRunManager
});

robotManager.on('disconnected', ({ manual } = {}) => {
  if (!manual) {
    store.addLog('warn', '机器人临时断线，后台任务将等待自动重连');
  }
});

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, UPLOAD_DIR);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 16 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname.endsWith('.bin')) {
      callback(new Error('只允许上传 .bin 固件'));
      return;
    }

    callback(null, true);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

function sendError(res, error, statusCode = 500) {
  res.status(statusCode).json({
    ok: false,
    message: error instanceof Error ? error.message : String(error)
  });
}

function broadcast(wss, payload) {
  const encoded = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(encoded);
    }
  }
}

function resolveFlashTarget(target) {
  if (target === 'camera') {
    return {
      target: 'camera',
      label: '相机模块'
    };
  }

  return {
    target: 'robot',
    label: '机器人主控'
  };
}

async function proxyCameraResource(res, kind) {
  const targetUrl = cameraManager.resolveUrl(kind);
  if (!targetUrl) {
    throw new Error('相机尚未连接，无法获取画面');
  }

  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  const response = await fetch(targetUrl, {
    signal: controller.signal
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`相机代理失败：${response.status} ${message}`.trim());
  }

  const contentType = response.headers.get('content-type');
  const cacheControl = response.headers.get('cache-control');
  const pragma = response.headers.get('pragma');
  const contentLength = response.headers.get('content-length');

  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  if (pragma) {
    res.setHeader('Pragma', pragma);
  }
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(response.status);

  if (!response.body) {
    res.end();
    return;
  }

  const stream = Readable.fromWeb(response.body);
  stream.on('error', (error) => {
    if (!res.headersSent) {
      sendError(res, error, 502);
      return;
    }

    res.destroy(error);
  });
  stream.pipe(res);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'esp32-robot-server',
    time: new Date().toISOString()
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    data: store.snapshot()
  });
});

app.get('/api/serial/ports', (_req, res) => {
  res.json({
    ok: true,
    data: store.snapshot().serial
  });
});

app.get('/api/camera/status', async (_req, res) => {
  try {
    if (cameraManager.getConfig()?.baseUrl) {
      await cameraManager.fetchStatus();
    }
    res.json({
      ok: true,
      data: store.snapshot().camera
    });
  } catch (error) {
    sendError(res, error, 502);
  }
});

app.get('/api/camera/stream', async (_req, res) => {
  try {
    await proxyCameraResource(res, 'stream');
  } catch (error) {
    if (error?.name === 'AbortError' || res.destroyed) {
      return;
    }

    sendError(res, error, 502);
  }
});

app.get('/api/camera/snapshot', async (_req, res) => {
  try {
    await proxyCameraResource(res, 'snapshot');
  } catch (error) {
    sendError(res, error, 502);
  }
});

app.get('/api/gait/config', (_req, res) => {
  res.json({
    ok: true,
    data: gaitOptimizer.getConfig()
  });
});

app.get('/api/gait/status', (_req, res) => {
  res.json({
    ok: true,
    data: store.snapshot().gait
  });
});

app.get('/api/sim/profiles', (_req, res) => {
  res.json({
    ok: true,
    data: simulationManager.listProfiles()
  });
});

app.post('/api/sim/profiles/otto/import-cad', async (_req, res) => {
  try {
    const data = await simulationManager.importCad('otto');
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.patch('/api/sim/profiles/otto/physical-params', (req, res) => {
  try {
    const data = simulationManager.updatePhysicalParams(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/connect', async (req, res) => {
  try {
    const data = await simulationManager.connect(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/disconnect', async (_req, res) => {
  try {
    if (gaitOptimizer.isRunning()) {
      await gaitOptimizer.stop('已停止 OTTO 仿真优化');
    }
    const data = await simulationManager.disconnect();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/calibration/manual', (req, res) => {
  try {
    const data = simulationManager.recordManualCalibration(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/ai/recommend', (_req, res) => {
  try {
    const data = simulationManager.recommendNextParams();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/mujoco/export', (_req, res) => {
  try {
    const data = simulationManager.exportMuJoCoDraft();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/sim/mujoco/run', async (req, res) => {
  try {
    const data = await simulationManager.runMuJoCoSimulation(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/connect', async (req, res) => {
  try {
    const { ip } = req.body ?? {};
    const robot = await robotManager.connect(ip);
    await robotManager.fetchStatus().catch(() => null);
    res.json({
      ok: true,
      data: robot
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/disconnect', async (_req, res) => {
  try {
    if (gaitOptimizer.isRunning()) {
      await gaitOptimizer.stop('已停止自动优化');
    }
    if (scriptRunner.isRunning()) {
      await scriptRunner.stop('已停止脚本控制');
    }
    await robotManager.disconnect();
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/camera/connect', async (req, res) => {
  try {
    const data = await cameraManager.connect(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/camera/disconnect', async (_req, res) => {
  try {
    const data = await cameraManager.disconnect();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/gait/start', async (req, res) => {
  try {
    const data = await gaitOptimizer.start(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/gait/stop', async (_req, res) => {
  try {
    const data = await gaitOptimizer.stop();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/script/run', async (req, res) => {
  try {
    if (gaitOptimizer.isRunning()) {
      await gaitOptimizer.stop('已停止自动优化，准备执行脚本');
    }

    const data = await scriptRunner.run(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/script/stop', async (_req, res) => {
  try {
    const data = await scriptRunner.stop();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/brain/run', async (req, res) => {
  try {
    if (gaitOptimizer.isRunning()) {
      await gaitOptimizer.stop('已停止自动优化，准备执行 Gemma 规划');
    }

    const { prompt, ip, servoId } = req.body ?? {};
    const plan = await planRobotScriptWithOllama({
      prompt,
      servoId
    });
    const run = await scriptRunner.run({
      script: plan.script,
      ip,
      servoId
    });

    store.addLog('success', `Gemma 已生成并提交脚本：${plan.model}`);
    res.json({
      ok: true,
      data: {
        ...run,
        brain: plan
      }
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/control', async (req, res) => {
  try {
    if (!pcBrainManager.canAcceptManualCommand(req.body ?? {})) {
      throw new Error('PC Brain 自动任务运行中，请先停止 PC Brain 或使用急停');
    }

    if (simulationManager.isConnected()) {
      await simulationManager.sendCommand(req.body);
    } else {
      await robotManager.sendCommand(req.body);
    }
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/pc-brain/status', (_req, res) => {
  res.json({
    ok: true,
    data: store.snapshot().pcBrain
  });
});

app.post('/api/pc-brain/start', async (req, res) => {
  try {
    const data = await pcBrainManager.start(req.body ?? {});
    res.json({
      ok: true,
      data,
      finalRun: store.snapshot().finalRun
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/pc-brain/stop', async (req, res) => {
  try {
    const data = await pcBrainManager.stop(req.body ?? {});
    res.json({
      ok: true,
      data,
      finalRun: store.snapshot().finalRun
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/pc-brain/vision', async (req, res) => {
  try {
    const data = await pcBrainManager.applyVision(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/final-run/start', async (req, res) => {
  try {
    const data = await finalRunManager.start(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/final-run/stop', async (_req, res) => {
  try {
    const data = await finalRunManager.stop();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/final-run/resume', async (_req, res) => {
  try {
    const data = await finalRunManager.resume();
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/final-run/vision', async (req, res) => {
  try {
    const data = await finalRunManager.applyVision(req.body ?? {});
    res.json({
      ok: true,
      data
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/firmware/upload', upload.single('firmware'), (req, res) => {
  try {
    if (!req.file) {
      throw new Error('没有接收到固件文件');
    }

    store.updateFirmware({
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      uploadedAt: new Date().toISOString(),
      progress: 0,
      lastResult: null,
      lastTarget: store.snapshot().firmware.lastTarget || 'robot',
      lastMode: null
    });
    store.addLog('success', `固件已上传：${req.file.originalname}`);

    res.json({
      ok: true,
      data: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size
      }
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/firmware/flash', async (req, res) => {
  try {
    const snapshot = store.snapshot();
    const {
      target: rawTarget = 'robot',
      mode = 'ota',
      ip: requestedIp,
      endpointPath,
      port,
      baudRate = USB_FLASH_BAUD_RATE
    } = req.body ?? {};
    const { target, label } = resolveFlashTarget(rawTarget);
    const ip = target === 'camera' ? requestedIp || snapshot.camera.ip : requestedIp || snapshot.robot.ip;
    const resolvedEndpointPath =
      endpointPath || (target === 'camera' ? snapshot.camera.otaPath || CAMERA_OTA_ENDPOINT_PATH : OTA_ENDPOINT_PATH);

    let result;
    if (mode === 'usb') {
      result = await flashFirmwareOverUsb({
        filePath: snapshot.firmware.filePath,
        port,
        baudRate,
        writeOffset: ESPTOOL_WRITE_OFFSET,
        store,
        target,
        targetLabel: label
      });
    } else {
      result = await flashFirmwareOverOta({
        ip,
        filePath: snapshot.firmware.filePath,
        endpointPath: resolvedEndpointPath,
        store,
        target,
        targetLabel: label
      });
    }

    res.json({
      ok: true,
      data: result
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.use((error, _req, res, _next) => {
  store.addLog('error', error.message);
  sendError(res, error, 400);
});

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws'
});

wss.on('connection', (socket) => {
  store.setConnectedClients(wss.clients.size);
  socket.send(
    JSON.stringify({
      type: 'snapshot',
      data: store.snapshot()
    })
  );

  socket.on('close', () => {
    store.setConnectedClients(wss.clients.size);
  });
});

store.on('status', (state) => {
  broadcast(wss, {
    type: 'status',
    data: state
  });
});

store.on('log', (entry) => {
  broadcast(wss, {
    type: 'log',
    data: entry
  });
});

server.listen(PORT, HOST, () => {
  serialScanner.start();
  store.addLog('success', `本地控制服务已启动：http://${HOST}:${PORT}`);
});
