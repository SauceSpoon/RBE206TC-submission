import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  StatusCard,
  allServoControls,
  appendCacheBuster,
  defaultCameraForm,
  defaultCalibrationForm,
  defaultGaitConfig,
  defaultOptimizerForm,
  defaultOttoPhysicalParams,
  defaultScriptPrompt,
  defaultServoTrimDrafts,
  defaultState,
  createOttoMotionProfileDrafts,
  formatValue,
  finalRunTargetLabels,
  getPageFromHash,
  normalizePageId,
  ottoAggressiveMoveButtons,
  ottoBowlingTacticButton,
  ottoMoveButtons,
  ottoMotionProfileDefaults,
  ottoMotionProfileFields,
  ottoMotionProfileSelector,
  ottoServoControls,
  ottoTestMoveButtons,
  pageTabs
} from './dashboard-config.jsx';
import ControlPage from './pages/ControlPage.jsx';
import FinalGoPage from './pages/FinalGoPage.jsx';
import OptimizePage from './pages/OptimizePage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import SimulationPage from './pages/SimulationPage.jsx';
import SystemPage from './pages/SystemPage.jsx';
import Task1Page from './pages/Task1Page.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
const LIVE_SERVO_INTERVAL_MS = 90;
const AUTO_CONNECT_IP = '192.168.10.10';
const Simulation3DPage = lazy(() => import('./pages/Simulation3DPage.jsx'));

function buildWsUrl() {
  if (API_BASE.startsWith('https://')) {
    return API_BASE.replace('https://', 'wss://') + '/ws';
  }

  return API_BASE.replace('http://', 'ws://') + '/ws';
}

function buildApiUrl(path) {
  return `${API_BASE}${path}`;
}

function getOttoMotionStorageKey(dashboard) {
  const robotIdentity = dashboard.robot.ip || dashboard.runtime.network?.ip || 'local';
  return `otto-motion-drafts:v2:${robotIdentity}`;
}

function clampOttoMotionProfileValue(field, value) {
  const numericValue = Number(value);
  const fallbackValue = Number(ottoMotionProfileDefaults.otto_forward[field.id] ?? 0);
  const roundedValue = Number.isFinite(numericValue) ? numericValue : fallbackValue;
  const steppedValue = Math.round(roundedValue / field.step) * field.step;

  return Number(Math.min(field.max, Math.max(field.min, steppedValue)).toFixed(2));
}

function normalizeOttoMotionProfile(motionId, profile = {}) {
  const fallbackProfile =
    ottoMotionProfileDefaults[motionId] || ottoMotionProfileDefaults.otto_forward;

  return Object.fromEntries(
    ottoMotionProfileFields.map((field) => [
      field.id,
      clampOttoMotionProfileValue(field, profile[field.id] ?? fallbackProfile[field.id])
    ])
  );
}

function normalizeOttoMotionDrafts(source = ottoMotionProfileDefaults) {
  const seededDrafts = createOttoMotionProfileDrafts(source);

  return Object.fromEntries(
    ottoMotionProfileSelector.map(({ id }) => [
      id,
      normalizeOttoMotionProfile(id, seededDrafts[id])
    ])
  );
}

function readOttoMotionDrafts(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    return normalizeOttoMotionDrafts(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeOttoMotionDrafts(storageKey, drafts) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(drafts));
}

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || '请求失败');
  }

  return payload;
}

function createChatMessage(role, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content
  };
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function normalizeDashboardState(payload) {
  const next = payload && typeof payload === 'object' ? payload : {};

  return {
    ...defaultState,
    ...next,
    service: {
      ...defaultState.service,
      ...(next.service || {})
    },
    robot: {
      ...defaultState.robot,
      ...(next.robot || {})
    },
    firmware: {
      ...defaultState.firmware,
      ...(next.firmware || {})
    },
    serial: {
      ...defaultState.serial,
      ...(next.serial || {})
    },
    runtime: {
      ...defaultState.runtime,
      ...(next.runtime || {}),
      capabilities: {
        ...defaultState.runtime.capabilities,
        ...(next.runtime?.capabilities || {})
      }
    },
    boundaryGuard: {
      ...defaultState.boundaryGuard,
      ...(next.boundaryGuard || {})
    },
    ultrasonic: {
      ...defaultState.ultrasonic,
      ...(next.ultrasonic || {})
    },
    camera: {
      ...defaultState.camera,
      ...(next.camera || {})
    },
    imu: {
      ...defaultState.imu,
      ...(next.imu || {}),
      accel: {
        ...defaultState.imu.accel,
        ...(next.imu?.accel || {})
      },
      gyro: {
        ...defaultState.imu.gyro,
        ...(next.imu?.gyro || {})
      }
    },
    gait: {
      ...defaultState.gait,
      ...(next.gait || {}),
      telemetry: {
        ...defaultState.gait.telemetry,
        ...(next.gait?.telemetry || {})
      },
      optimizer: {
        ...defaultState.gait.optimizer,
        ...(next.gait?.optimizer || {})
      }
    },
    simulation: {
      ...defaultState.simulation,
      ...(next.simulation || {}),
      profiles: {
        ...defaultState.simulation.profiles,
        ...(next.simulation?.profiles || {})
      },
      metrics: {
        ...defaultState.simulation.metrics,
        ...(next.simulation?.metrics || {})
      },
      calibration: {
        ...defaultState.simulation.calibration,
        ...(next.simulation?.calibration || {})
      },
      tracking: {
        ...defaultState.simulation.tracking,
        ...(next.simulation?.tracking || {})
      },
      digitalTwin: {
        ...defaultState.simulation.digitalTwin,
        ...(next.simulation?.digitalTwin || {})
      },
      recommendations: Array.isArray(next.simulation?.recommendations)
        ? next.simulation.recommendations
        : defaultState.simulation.recommendations,
      history: Array.isArray(next.simulation?.history)
        ? next.simulation.history
        : defaultState.simulation.history
    },
    scriptRunner: {
      ...defaultState.scriptRunner,
      ...(next.scriptRunner || {})
    },
    finalRun: {
      ...defaultState.finalRun,
      ...(next.finalRun || {}),
      targetLabel: next.finalRun?.targetLabel === ''
        ? ''
        : finalRunTargetLabels.includes(next.finalRun?.targetLabel)
        ? next.finalRun.targetLabel
        : defaultState.finalRun.targetLabel
    },
    pcBrain: {
      ...defaultState.pcBrain,
      ...(next.pcBrain || {}),
      externalBrain: {
        ...defaultState.pcBrain.externalBrain,
        ...(next.pcBrain?.externalBrain || {})
      }
    },
    servoAngles: {
      ...defaultState.servoAngles,
      ...(next.servoAngles || {})
    },
    logs: Array.isArray(next.logs) ? next.logs : defaultState.logs
  };
}

const MOTION_LABEL = {
  w: '同步直行',
  s: '同步后退',
  q: '左转',
  e: '右转',
  ArrowUp: '前进',
  ArrowDown: '后退',
  ArrowLeft: '左转',
  ArrowRight: '右转',
};

function findMovePayload(buttons, label) {
  return buttons.find((button) => button.label === label)?.payload;
}

function getMovePayloadByKey(key, keyboardControlMode, activePage) {
  const defaultMovePayloadByKey = {
    w: { type: 'move', direction: 'otto_forward', speed: 40 },
    s: { type: 'move', direction: 'otto_backward', speed: 40 },
    q: { type: 'move', direction: 'otto_left', speed: 40 },
    e: { type: 'move', direction: 'otto_right', speed: 40 },
    ArrowUp: { type: 'move', direction: 'forward', speed: 40 },
  };

  if (activePage !== 'otto-control') {
    return defaultMovePayloadByKey[key];
  }

  if (keyboardControlMode === 'smooth') {
    return defaultMovePayloadByKey[key];
  }

  const stableMovePayloadByKey = {
    ...defaultMovePayloadByKey,
    w: findMovePayload(ottoTestMoveButtons, '同步直行') || defaultMovePayloadByKey.w,
    s: findMovePayload(ottoTestMoveButtons, '同步后退') || defaultMovePayloadByKey.s,
    q: findMovePayload(ottoTestMoveButtons, '左快') || defaultMovePayloadByKey.q,
    e: findMovePayload(ottoTestMoveButtons, '右转') || defaultMovePayloadByKey.e
  };

  if (keyboardControlMode === 'super') {
    return {
      ...stableMovePayloadByKey,
      w: {
        type: 'move',
        direction: 'otto_forward',
        speed: 60,
        ottoMotionProfile: {
          periodMs: 900,
          leftLegAmplitudeDeg: 10.2,
          rightLegAmplitudeDeg: 11,
          leftHipAmplitudeDeg: 17.5,
          rightHipAmplitudeDeg: 18.5
        }
      }
    }[key];
  }

  if (keyboardControlMode !== 'aggressive') {
    return stableMovePayloadByKey[key];
  }

  const aggressiveMovePayloadByKey = {
    ...stableMovePayloadByKey,
    w: findMovePayload(ottoAggressiveMoveButtons, '同步直行') || stableMovePayloadByKey.w,
    q: findMovePayload(ottoMoveButtons, '左快') || stableMovePayloadByKey.q
  };

  return aggressiveMovePayloadByKey[key];
}

function getMotionLabelByKey(key, keyboardControlMode, activePage) {
  if (activePage === 'otto-control' && keyboardControlMode === 'super') {
    if (key === 'w') {
      return '超级同步直行';
    }

    if (key === 'q') {
      return '左快';
    }
  }

  if (activePage === 'otto-control' && keyboardControlMode === 'stable' && key === 'q') {
    return '左快';
  }

  if (activePage === 'otto-control' && keyboardControlMode === 'aggressive') {
    if (key === 'w') {
      return '激进同步直行';
    }

    if (key === 'q') {
      return '左快';
    }
  }

  return MOTION_LABEL[key];
}

export default function App() {
  const [dashboard, setDashboard] = useState(defaultState);
  const [gaitConfig, setGaitConfig] = useState(defaultGaitConfig);
  const [optimizerForm, setOptimizerForm] = useState(defaultOptimizerForm);
  const [ottoPhysicalParams, setOttoPhysicalParams] = useState(defaultOttoPhysicalParams);
  const [calibrationForm, setCalibrationForm] = useState(defaultCalibrationForm);
  const [activePage, setActivePage] = useState(() => getPageFromHash());
  const [ip, setIp] = useState(AUTO_CONNECT_IP);
  const [cameraForm, setCameraForm] = useState(defaultCameraForm);
  const [cameraSnapshotToken, setCameraSnapshotToken] = useState(Date.now());
  const [cameraSnapshotRequested, setCameraSnapshotRequested] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [flashTarget, setFlashTarget] = useState('robot');
  const [flashMode, setFlashMode] = useState('ota');
  const [usbPort, setUsbPort] = useState('/dev/cu.usbserial-0001');
  const [scriptPrompt, setScriptPrompt] = useState(defaultScriptPrompt);
  const [scriptServoId, setScriptServoId] = useState(7);
  const [chatMessages, setChatMessages] = useState(() => [
    createChatMessage(
      'assistant',
      '这里是本地机器人控制窗口。可以直接输入中文脚本执行，也可以输入自然语言后交给本地 Ollama/Gemma 规划成脚本再执行。'
    )
  ]);
  const [busy, setBusy] = useState({
    connect: false,
    camera: false,
    upload: false,
    flash: false,
    gait: false,
    script: false,
    brain: false,
    simulation: false
  });
  const [servoDrafts, setServoDrafts] = useState(defaultState.servoAngles);
  const [servoTrimDrafts, setServoTrimDrafts] = useState(defaultServoTrimDrafts);
  const [servoLiveMode, setServoLiveMode] = useState(false);
  const [ottoMotionDrafts, setOttoMotionDrafts] = useState(() => normalizeOttoMotionDrafts());
  const [savedOttoMotionProfiles, setSavedOttoMotionProfiles] = useState(() =>
    normalizeOttoMotionDrafts()
  );
  const [selectedOttoMotion, setSelectedOttoMotion] = useState(
    ottoMotionProfileSelector[0].id
  );
  const [ottoMotionSaveStatus, setOttoMotionSaveStatus] = useState({
    motionId: '',
    state: 'idle',
    message: ''
  });
  const [ottoMotionStorageReadyKey, setOttoMotionStorageReadyKey] = useState(null);
  const [toast, setToast] = useState('');
  const [cameraConnectError, setCameraConnectError] = useState('');
  const [activeMotionKey, setActiveMotionKey] = useState(null);
  const [keyboardControlMode, setKeyboardControlMode] = useState('stable');
  const activeKeyRef = useRef(null);
  const moveRepeatTimerRef = useRef(null);
  const liveServoTimersRef = useRef({});
  const liveServoPendingRef = useRef({});
  const liveServoLastSentAtRef = useRef({});
  const autoConnectAttemptedRef = useRef(false);
  const ottoMotionStorageKey = getOttoMotionStorageKey(dashboard);

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageFromHash());
    }

    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${pageTabs[0].id}`);
    } else {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    loadStatus().catch(() => {});
    loadGaitConfig().catch(() => {});
    let socket = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let mounted = true;

    function scheduleSocketReconnect() {
      if (!mounted || reconnectTimer) {
        return;
      }

      reconnectAttempts += 1;
      const delayMs = Math.min(1000 * reconnectAttempts, 5000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectStatusSocket();
      }, delayMs);
    }

    function connectStatusSocket() {
      socket = new WebSocket(buildWsUrl());

      socket.addEventListener('open', () => {
        reconnectAttempts = 0;
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'snapshot' || payload.type === 'status') {
            setDashboard(normalizeDashboardState(payload.data));
            return;
          }

          if (payload.type === 'log') {
            setDashboard((current) => ({
              ...current,
              logs: [...current.logs.slice(-199), payload.data]
            }));
          }
        } catch (error) {
          console.error(error);
        }
      });

      socket.addEventListener('close', () => {
        scheduleSocketReconnect();
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    }

    connectStatusSocket();

    const poller = window.setInterval(() => {
      loadStatus().catch(() => {});
    }, 10000);

    return () => {
      mounted = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      window.clearInterval(poller);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    setServoDrafts(dashboard.servoAngles);
  }, [dashboard.servoAngles]);

  useEffect(() => {
    if (dashboard.robot.ip) {
      setIp((currentIp) => (currentIp.trim() ? currentIp : dashboard.robot.ip));
    }
  }, [dashboard.robot.ip]);

  useEffect(() => {
    if (autoConnectAttemptedRef.current || dashboard.robot.connected || busy.connect) {
      return;
    }
    autoConnectAttemptedRef.current = true;
    setBusy((current) => ({ ...current, connect: true }));
    request('/api/connect', {
      method: 'POST',
      body: JSON.stringify({ ip: AUTO_CONNECT_IP })
    })
      .then(() => {
        setIp(AUTO_CONNECT_IP);
        setToast(`自动连接 ${AUTO_CONNECT_IP} 成功`);
      })
      .catch(() => {})
      .finally(() => {
        setBusy((current) => ({ ...current, connect: false }));
      });
  }, [dashboard.robot.connected, busy.connect]);

  useEffect(() => {
    const offsets = dashboard.runtime.build?.servoZeroOffsets;
    if (!Array.isArray(offsets)) {
      return;
    }

    setServoTrimDrafts(
      Object.fromEntries(
        allServoControls.map(({ id }) => [id, Number(offsets[id - 1] ?? 0)])
      )
    );
  }, [dashboard.runtime.build?.servoZeroOffsets]);

  useEffect(() => {
    if (dashboard.scriptRunner?.targetServoId) {
      setScriptServoId(Number(dashboard.scriptRunner.targetServoId));
    }
  }, [dashboard.scriptRunner?.targetServoId]);

  useEffect(() => {
    const params = dashboard.simulation?.profiles?.otto?.physicalParams;
    if (!params) {
      return;
    }

    setOttoPhysicalParams((current) => ({
      ...current,
      ...params
    }));
  }, [dashboard.simulation?.profiles?.otto?.physicalParams]);

  useEffect(() => {
    const profileSnapshot = dashboard.runtime.build?.ottoMotionProfiles;
    const savedProfiles = profileSnapshot?.saved || profileSnapshot;
    const defaultProfiles = profileSnapshot?.default || dashboard.runtime.build?.ottoMotionProfileDefaults;
    const savedDefaults = dashboard.runtime.build?.ottoMotionProfileDefaults;
    const storedDrafts = readOttoMotionDrafts(ottoMotionStorageKey);
    const nextSavedProfiles = normalizeOttoMotionDrafts(
      savedProfiles || defaultProfiles || savedDefaults || ottoMotionProfileDefaults
    );

    setSavedOttoMotionProfiles(nextSavedProfiles);

    if (storedDrafts) {
      setOttoMotionDrafts(storedDrafts);
    } else if (savedProfiles || defaultProfiles || savedDefaults) {
      setOttoMotionDrafts(nextSavedProfiles);
    }

    setOttoMotionStorageReadyKey(ottoMotionStorageKey);
  }, [
    ottoMotionStorageKey,
    dashboard.runtime.build?.ottoMotionProfiles,
    dashboard.runtime.build?.ottoMotionProfileDefaults
  ]);

  useEffect(() => {
    if (ottoMotionStorageReadyKey !== ottoMotionStorageKey) {
      return;
    }

    writeOttoMotionDrafts(ottoMotionStorageKey, ottoMotionDrafts);
  }, [ottoMotionDrafts, ottoMotionStorageKey, ottoMotionStorageReadyKey]);

  useEffect(() => {
    const camera = dashboard.camera || defaultState.camera;
    if (!camera.connected && !camera.ip && !camera.baseUrl) {
      return;
    }

    setCameraForm((current) => {
      if (!camera.connected && current.ip && current.ip !== camera.ip) {
        return current;
      }

      return {
        ...current,
        ip: camera.ip || current.ip,
        label: camera.label || current.label,
        streamPath: camera.streamPath || current.streamPath,
        snapshotPath: camera.snapshotPath || current.snapshotPath,
        statusPath: camera.statusPath || current.statusPath,
        otaPath: camera.otaPath || current.otaPath
      };
    });
  }, [dashboard.camera]);

  useEffect(() => {
    const ports = dashboard.serial?.ports || [];
    if (ports.length === 0) {
      return;
    }

    const currentExists = ports.some((port) => port.path === usbPort);
    if (!usbPort || !currentExists) {
      setUsbPort(dashboard.serial.recommendedPort || ports[0].path);
    }
  }, [dashboard.serial, usbPort]);

  useEffect(() => {
    return () => {
      Object.values(liveServoTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  useEffect(() => {
    if (servoLiveMode) {
      return;
    }

    Object.values(liveServoTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    liveServoTimersRef.current = {};
    liveServoPendingRef.current = {};
  }, [servoLiveMode]);

  useEffect(() => {
    if (activePage === 'final-go') {
      return undefined;
    }

    const MOVE_REPEAT_MS = 100;
    function stopRepeatTimer() {
      if (moveRepeatTimerRef.current) {
        clearInterval(moveRepeatTimerRef.current);
        moveRepeatTimerRef.current = null;
      }
    }

    function startRepeatTimer(payload) {
      stopRepeatTimer();
      moveRepeatTimerRef.current = setInterval(() => {
        handleCommand(payload);
      }, MOVE_REPEAT_MS);
    }

    function clearMotion() {
      stopRepeatTimer();
      activeKeyRef.current = null;
      setActiveMotionKey(null);
    }

    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        clearMotion();
        handleCommand({ type: 'emergency_stop' });
        setToast('⚡ 已触发急停（键盘）');
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearMotion();
        handleCommand({ type: 'move', direction: 'stop', speed: 0 });
        setToast('⏹ 已停止移动（键盘 Esc）');
        return;
      }

      const payload = getMovePayloadByKey(event.key, keyboardControlMode, activePage);
      if (!payload) {
        return;
      }

      if (activeKeyRef.current === event.key) {
        return;
      }

      if (activeKeyRef.current) {
        handleCommand({ type: 'move', direction: 'stop', speed: 0 });
      }

      event.preventDefault();
      activeKeyRef.current = event.key;
      setActiveMotionKey(event.key);
      handleCommand(payload);
      startRepeatTimer(payload);
      const label = getMotionLabelByKey(event.key, keyboardControlMode, activePage);
      setToast(`⌨ ${label ? label + '（按住持续运动）' : '键盘控制'}`);
    }

    function handleKeyUp(event) {
      if (isTypingTarget(event.target) || !getMovePayloadByKey(event.key, keyboardControlMode, activePage)) {
        return;
      }

      if (activeKeyRef.current !== event.key) {
        return;
      }

      event.preventDefault();
      clearMotion();
      handleCommand({ type: 'move', direction: 'stop', speed: 0 });
    }

    function handleBlur() {
      if (activeKeyRef.current) {
        clearMotion();
        handleCommand({ type: 'move', direction: 'stop', speed: 0 });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      stopRepeatTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activePage, handleCommand, keyboardControlMode]);

  async function loadStatus() {
    const payload = await request('/api/status');
    setDashboard(normalizeDashboardState(payload.data));
  }

  async function loadGaitConfig() {
    const payload = await request('/api/gait/config');
    setGaitConfig(payload.data);
    setOptimizerForm((current) => ({
      ...current,
      ...payload.data.defaults
    }));
  }

  async function handleConnect() {
    setBusy((current) => ({ ...current, connect: true }));

    try {
      await request('/api/connect', {
        method: 'POST',
        body: JSON.stringify({ ip })
      });
      setToast('机器人连接成功');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, connect: false }));
    }
  }

  async function handleDisconnect() {
    setBusy((current) => ({ ...current, connect: true }));

    try {
      await request('/api/disconnect', {
        method: 'POST'
      });
      setToast('连接已断开');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, connect: false }));
    }
  }

  async function handleCameraConnect() {
    setBusy((current) => ({ ...current, camera: true }));
    setCameraConnectError('');

    try {
      const payload = await request('/api/camera/connect', {
        method: 'POST',
        body: JSON.stringify(cameraForm)
      });
      setDashboard((current) => ({
        ...current,
        camera: {
          ...current.camera,
          ...(payload.data || {})
        }
      }));
      setCameraSnapshotRequested(false);
      setToast('相机代理连接成功');
    } catch (error) {
      setCameraConnectError(error.message);
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, camera: false }));
    }
  }

  async function handleCameraDisconnect() {
    setBusy((current) => ({ ...current, camera: true }));

    try {
      await request('/api/camera/disconnect', {
        method: 'POST'
      });
      setCameraSnapshotRequested(false);
      setToast('相机代理已断开');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, camera: false }));
    }
  }

  async function handleCommand(payload) {
    try {
      await postControlCommand(payload);
    } catch (error) {
      setToast(error.message);
    }
  }

  async function postControlCommand(payload) {
    return request('/api/control', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function getOttoMotionDraft(motionId = selectedOttoMotion) {
    return normalizeOttoMotionProfile(motionId, ottoMotionDrafts[motionId]);
  }

  function updateOttoMotionDraft(motionId, fieldId, value) {
    const field = ottoMotionProfileFields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }

    setOttoMotionSaveStatus((current) =>
      current.motionId === motionId ? { motionId: '', state: 'idle', message: '' } : current
    );
    setOttoMotionDrafts((current) => ({
      ...current,
      [motionId]: normalizeOttoMotionProfile(motionId, {
        ...current[motionId],
        [fieldId]: clampOttoMotionProfileValue(field, value)
      })
    }));
  }

  function restoreOttoMotionDefaults(motionId = selectedOttoMotion) {
    setOttoMotionSaveStatus((current) =>
      current.motionId === motionId ? { motionId: '', state: 'idle', message: '' } : current
    );
    setOttoMotionDrafts((current) => ({
      ...current,
      [motionId]: normalizeOttoMotionProfile(
        motionId,
        savedOttoMotionProfiles[motionId] || ottoMotionProfileDefaults[motionId]
      )
    }));
  }

  async function testOttoMotionProfile(motionId = selectedOttoMotion) {
    const currentDraft = getOttoMotionDraft(motionId);

    try {
      await postControlCommand({
        type: 'move',
        direction: motionId,
        speed: 40,
        motionProfile: currentDraft
      });
      setToast(`已试跑 ${ottoMotionProfileSelector.find(({ id }) => id === motionId)?.label || motionId}`);
    } catch (error) {
      setToast(error.message);
    }
  }

  async function saveOttoMotionProfile(motionId = selectedOttoMotion) {
    const currentDraft = getOttoMotionDraft(motionId);
    const motionLabel = ottoMotionProfileSelector.find(({ id }) => id === motionId)?.label || motionId;

    setOttoMotionSaveStatus({
      motionId,
      state: 'saving',
      message: `正在保存 ${motionLabel}...`
    });

    try {
      await postControlCommand({
        type: 'otto_motion_profile_save',
        direction: motionId,
        motionProfile: currentDraft
      });
      setOttoMotionSaveStatus({
        motionId,
        state: 'success',
        message: `${motionLabel} 已保存到机器人`
      });
      setSavedOttoMotionProfiles((current) => ({
        ...current,
        [motionId]: currentDraft
      }));
      setToast(`${motionLabel} 已保存到机器人`);
    } catch (error) {
      setOttoMotionSaveStatus({
        motionId,
        state: 'error',
        message: error.message
      });
      setToast(error.message);
    }
  }

  async function centerAllServos() {
    setServoDrafts((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [key, 90]))
    );

    try {
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify({
          type: 'action',
          name: 'center'
        })
      });
      setToast('已按保存零位归中');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function factoryCenterAllServos() {
    setServoDrafts((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [key, 90]))
    );
    setServoTrimDrafts((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [key, 0]))
    );

    try {
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify({
          type: 'servo_trim_reset_all'
        })
      });
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify({
          type: 'action',
          name: 'center'
        })
      });
      setToast('已清空零位偏移并归中');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setToast('请先选择 .bin 固件');
      return;
    }

    setBusy((current) => ({ ...current, upload: true }));
    const formData = new FormData();
    formData.append('firmware', selectedFile);

    try {
      await request('/api/firmware/upload', {
        method: 'POST',
        body: formData
      });
      setToast('固件上传成功');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, upload: false }));
    }
  }

  async function handleFlash() {
    setBusy((current) => ({ ...current, flash: true }));

    try {
      const targetIp = flashTarget === 'camera' ? cameraForm.ip : ip;
      await request('/api/firmware/flash', {
        method: 'POST',
        body: JSON.stringify({
          target: flashTarget,
          mode: flashMode,
          ip: targetIp,
          endpointPath: flashTarget === 'camera' ? cameraForm.otaPath : undefined,
          port: flashMode === 'usb' ? usbPort : undefined
        })
      });
      const targetLabel = flashTarget === 'camera' ? '相机模块' : '机器人主控';
      setToast(
        flashMode === 'usb'
          ? `${targetLabel} USB 烧录完成`
          : `${targetLabel} OTA 升级命令已发送`
      );
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, flash: false }));
    }
  }

  async function handleStartOptimization() {
    setBusy((current) => ({ ...current, gait: true }));

    try {
      await request('/api/gait/start', {
        method: 'POST',
        body: JSON.stringify(optimizerForm)
      });
      setToast('自动优化已启动');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, gait: false }));
    }
  }

  async function handleStopOptimization() {
    setBusy((current) => ({ ...current, gait: true }));

    try {
      await request('/api/gait/stop', {
        method: 'POST'
      });
      setToast('自动优化已停止');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, gait: false }));
    }
  }

  async function handleRunScript() {
    const resolvedIp = ip || dashboard.robot.ip;
    setBusy((current) => ({ ...current, script: true }));
    setChatMessages((current) => [...current.slice(-11), createChatMessage('user', scriptPrompt)]);

    try {
      const payload = await request('/api/script/run', {
        method: 'POST',
        body: JSON.stringify({
          script: scriptPrompt,
          ip: resolvedIp,
          servoId: Number(scriptServoId)
        })
      });
      const summary = payload.data?.plan?.summary || [];
      const reply =
        summary.length > 0
          ? `已开始执行。\n${summary.join('\n')}`
          : '脚本已提交，服务端开始执行。';
      setChatMessages((current) => [...current.slice(-11), createChatMessage('assistant', reply)]);
      setToast('脚本已开始执行');
    } catch (error) {
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', `执行失败：${error.message}`)
      ]);
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, script: false }));
    }
  }

  async function handleRunWithBrain() {
    const resolvedIp = ip || dashboard.robot.ip;
    setBusy((current) => ({ ...current, brain: true }));
    setChatMessages((current) => [...current.slice(-11), createChatMessage('user', scriptPrompt)]);

    try {
      const payload = await request('/api/brain/run', {
        method: 'POST',
        body: JSON.stringify({
          prompt: scriptPrompt,
          ip: resolvedIp,
          servoId: Number(scriptServoId)
        })
      });
      const summary = payload.data?.plan?.summary || [];
      const brain = payload.data?.brain || {};
      if (brain.script) {
        setScriptPrompt(brain.script);
      }
      const reply = [
        brain.reply || 'Gemma 已生成脚本并开始执行。',
        brain.script ? `生成脚本：\n${brain.script}` : '',
        summary.length > 0 ? `执行计划：\n${summary.join('\n')}` : ''
      ]
        .filter(Boolean)
        .join('\n\n');
      setChatMessages((current) => [...current.slice(-11), createChatMessage('assistant', reply)]);
      setToast('Gemma 已规划并开始执行');
    } catch (error) {
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', `Gemma 规划失败：${error.message}`)
      ]);
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, brain: false }));
    }
  }

  async function handleStopScript() {
    setBusy((current) => ({ ...current, script: true }));

    try {
      await request('/api/script/stop', {
        method: 'POST'
      });
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', '当前脚本已停止。')
      ]);
      setToast('脚本已停止');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, script: false }));
    }
  }

  function updateServo(id, angle) {
    const nextAngle = Number(angle);

    setServoDrafts((current) => ({
      ...current,
      [id]: nextAngle
    }));

    if (servoLiveMode) {
      scheduleLiveServo(id, nextAngle);
    }
  }

  function commitServo(id, angle = servoDrafts[id]) {
    flushLiveServo(id, Number(angle));
  }

  function sendServoCommand(id, angle) {
    handleCommand({
      type: 'servo',
      id,
      angle: Number(angle)
    });
  }

  function scheduleLiveServo(id, angle) {
    liveServoPendingRef.current[id] = Number(angle);

    const existingTimer = liveServoTimersRef.current[id];
    const elapsed = Date.now() - (liveServoLastSentAtRef.current[id] || 0);
    const remaining = Math.max(0, LIVE_SERVO_INTERVAL_MS - elapsed);

    if (!existingTimer && remaining === 0) {
      liveServoLastSentAtRef.current[id] = Date.now();
      const nextAngle = liveServoPendingRef.current[id];
      delete liveServoPendingRef.current[id];
      sendServoCommand(id, nextAngle);
      return;
    }

    if (existingTimer) {
      return;
    }

    liveServoTimersRef.current[id] = window.setTimeout(() => {
      delete liveServoTimersRef.current[id];
      const nextAngle = liveServoPendingRef.current[id];
      delete liveServoPendingRef.current[id];
      liveServoLastSentAtRef.current[id] = Date.now();
      sendServoCommand(id, nextAngle);
    }, remaining || LIVE_SERVO_INTERVAL_MS);
  }

  function flushLiveServo(id, angle) {
    const existingTimer = liveServoTimersRef.current[id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete liveServoTimersRef.current[id];
    }

    delete liveServoPendingRef.current[id];
    liveServoLastSentAtRef.current[id] = Date.now();
    sendServoCommand(id, Number(angle));
  }

  function updateServoTrim(id, offset) {
    setServoTrimDrafts((current) => ({
      ...current,
      [id]: Number(offset)
    }));
  }

  function commitServoTrim(id, offset = servoTrimDrafts[id]) {
    handleCommand({
      type: 'servo_trim',
      id,
      offset: Number(offset),
      applyNow: true
    });
  }

  async function captureCurrentPoseAsZero() {
    try {
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify({
          type: 'servo_trim_capture_current_pose'
        })
      });

      setServoDrafts((current) =>
        Object.fromEntries(Object.keys(current).map((key) => [key, 90]))
      );

      setToast('已将当前姿态保存为新的零位');
    } catch (error) {
      setToast(error.message);
    }
  }

  function updateOptimizerForm(field, value) {
    setOptimizerForm((current) => ({
      ...current,
      [field]: field === 'target' ? value : Number(value)
    }));
  }

  function updateOttoPhysicalParam(field, value) {
    setOttoPhysicalParams((current) => ({
      ...current,
      [field]: Number(value)
    }));
  }

  function updateCalibrationForm(field, value) {
    setCalibrationForm((current) => ({
      ...current,
      [field]: field === 'fallen' ? Boolean(value) : Number(value)
    }));
  }

  async function runSimulationRequest(action, successMessage) {
    setBusy((current) => ({ ...current, simulation: true }));

    try {
      await action();
      if (successMessage) {
        setToast(successMessage);
      }
      await loadStatus();
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, simulation: false }));
    }
  }

  async function handleImportSimCad() {
    await runSimulationRequest(
      () => request('/api/sim/profiles/otto/import-cad', { method: 'POST' }),
      'OTTO CAD 已导入'
    );
  }

  async function handleSavePhysicalParams() {
    await runSimulationRequest(
      () =>
        request('/api/sim/profiles/otto/physical-params', {
          method: 'PATCH',
          body: JSON.stringify(ottoPhysicalParams)
        }),
      'OTTO 物理参数已保存'
    );
  }

  async function handleConnectSimulation() {
    await runSimulationRequest(
      () =>
        request('/api/sim/connect', {
          method: 'POST',
          body: JSON.stringify({ profileId: 'otto' })
        }),
      'OTTO 本地仿真已连接'
    );
  }

  async function handleDisconnectSimulation() {
    await runSimulationRequest(
      () => request('/api/sim/disconnect', { method: 'POST' }),
      'OTTO 本地仿真已断开'
    );
  }

  async function handleRunSimulationTrial() {
    await runSimulationRequest(
      () =>
        request('/api/control', {
          method: 'POST',
          body: JSON.stringify({
            type: 'gait_trial_start',
            gaitName: 'otto_sim_walk',
            durationMs: 3500,
            params:
              dashboard.simulation.currentParams ||
              dashboard.simulation.profiles?.otto?.gaitDefaults ||
              undefined
          })
        }),
      'OTTO 仿真试验完成'
    );
  }

  async function handleManualCalibration() {
    await runSimulationRequest(
      () =>
        request('/api/sim/calibration/manual', {
          method: 'POST',
          body: JSON.stringify(calibrationForm)
        }),
      '手动校准已录入'
    );
  }

  async function handleRecommendSimulation() {
    await runSimulationRequest(
      () => request('/api/sim/ai/recommend', { method: 'POST' }),
      '已生成下一组 OTTO 步态参数建议'
    );
  }

  async function handleExportMuJoCoDraft() {
    await runSimulationRequest(
      () => request('/api/sim/mujoco/export', { method: 'POST' }),
      'MuJoCo MJCF 草案已生成'
    );
  }

  async function handleRunMuJoCoSimulation() {
    await runSimulationRequest(
      () =>
        request('/api/sim/mujoco/run', {
          method: 'POST',
          body: JSON.stringify({
            durationMs: 600,
            params:
              dashboard.simulation.currentParams ||
              dashboard.simulation.profiles?.otto?.gaitDefaults ||
              undefined
          })
        }),
      'MuJoCo 动态仿真已完成'
    );
  }

  async function handleStopSimulation() {
    if (!dashboard.simulation?.connected) {
      setToast('3D 预览已停止；本地仿真尚未连接');
      return;
    }

    await runSimulationRequest(
      () =>
        request('/api/control', {
          method: 'POST',
          body: JSON.stringify({
            type: 'gait_trial_stop',
            gaitName: 'otto_sim_walk'
          })
        }),
      'OTTO 仿真已停止'
    );
  }

  function updateCameraForm(field, value) {
    setCameraForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function requestSnapshot() {
    setCameraSnapshotRequested(true);
    setCameraSnapshotToken(Date.now());
  }

  function navigateToPage(pageId) {
    const nextPage = normalizePageId(pageId);
    setActivePage(nextPage);

    if (window.location.hash !== `#${nextPage}`) {
      window.location.hash = nextPage;
    }
  }

  function renderActivePage() {
    switch (activePage) {
      case 'overview':
        return (
          <OverviewPage
            dashboard={dashboard}
            ip={ip}
            setIp={setIp}
            busy={busy}
            scriptPrompt={scriptPrompt}
            setScriptPrompt={setScriptPrompt}
            scriptServoId={scriptServoId}
            setScriptServoId={setScriptServoId}
            chatMessages={chatMessages}
            handleRunScript={handleRunScript}
            handleRunWithBrain={handleRunWithBrain}
            handleStopScript={handleStopScript}
            handleConnect={handleConnect}
            handleDisconnect={handleDisconnect}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            flashTarget={flashTarget}
            setFlashTarget={setFlashTarget}
            flashMode={flashMode}
            setFlashMode={setFlashMode}
            usbPort={usbPort}
            setUsbPort={setUsbPort}
            flashTargetLabel={flashTargetLabel}
            flashTargetIp={flashTargetIp}
            handleUpload={handleUpload}
            handleFlash={handleFlash}
          />
        );
      case 'final-go':
        return (
          <FinalGoPage
            apiBase={API_BASE}
            dashboard={dashboard}
            ip={ip}
            setIp={setIp}
            cameraForm={cameraForm}
            updateCameraForm={updateCameraForm}
            busy={busy}
            cameraConnectError={cameraConnectError}
            finalRun={dashboard.finalRun || defaultState.finalRun}
            pcBrain={dashboard.pcBrain || defaultState.pcBrain}
            gaitTelemetry={gaitTelemetry}
            ultrasonic={dashboard.ultrasonic || defaultState.ultrasonic}
            cameraSnapshotProxyUrl={cameraSnapshotProxyUrl}
            liveStreamUrl={liveStreamUrl}
            handleConnect={handleConnect}
            handleDisconnect={handleDisconnect}
            handleCameraConnect={handleCameraConnect}
            handleCameraDisconnect={handleCameraDisconnect}
            onFinalRunUpdate={(finalRun) =>
              setDashboard((current) => ({
                ...current,
                finalRun: {
                  ...current.finalRun,
                  ...finalRun
                }
              }))
            }
            onPcBrainUpdate={(pcBrain) =>
              setDashboard((current) => ({
                ...current,
                pcBrain: {
                  ...current.pcBrain,
                  ...pcBrain
                }
              }))
            }
            manualCommand={postControlCommand}
            onToast={setToast}
          />
        );
      case 'task1':
        return <Task1Page manualCommand={postControlCommand} onToast={setToast} />;
      case 'control':
        return (
          <ControlPage
            dashboard={dashboard}
            handleCommand={handleCommand}
            centerAllServos={centerAllServos}
            factoryCenterAllServos={factoryCenterAllServos}
            captureCurrentPoseAsZero={captureCurrentPoseAsZero}
            servoDrafts={servoDrafts}
            updateServo={updateServo}
            commitServo={commitServo}
            trimRange={trimRange}
            servoTrimDrafts={servoTrimDrafts}
            updateServoTrim={updateServoTrim}
            commitServoTrim={commitServoTrim}
            servoLiveMode={servoLiveMode}
            setServoLiveMode={setServoLiveMode}
            activeMotionKey={activeMotionKey}
          />
        );
      case 'otto-control':
        return (
          <ControlPage
            dashboard={dashboard}
            handleCommand={handleCommand}
            centerAllServos={centerAllServos}
            factoryCenterAllServos={factoryCenterAllServos}
            captureCurrentPoseAsZero={captureCurrentPoseAsZero}
            servoDrafts={servoDrafts}
            updateServo={updateServo}
            commitServo={commitServo}
            trimRange={trimRange}
            servoTrimDrafts={servoTrimDrafts}
            updateServoTrim={updateServoTrim}
            commitServoTrim={commitServoTrim}
            servoLiveMode={servoLiveMode}
            setServoLiveMode={setServoLiveMode}
            activeMotionKey={activeMotionKey}
            keyboardControlMode={keyboardControlMode}
            setKeyboardControlMode={setKeyboardControlMode}
            keyboardActionButtons={[ottoBowlingTacticButton]}
            title="实时控制区(Otto)"
            description="参考 Otto 正弦步态控制左腿、右腿、左胯和右胯。"
            shortcutLabel="按钮控制 Otto 步态"
            actionButtons={[]}
            moveTitle="稳定区"
            moveButtons={ottoMoveButtons}
            secondaryMoveTitle="激进区"
            secondaryMoveButtons={ottoAggressiveMoveButtons}
            testMoveTitle="测试区"
            testMoveButtons={ottoTestMoveButtons}
            servoControls={ottoServoControls}
            ottoMotionDrafts={ottoMotionDrafts}
            selectedOttoMotion={selectedOttoMotion}
            setSelectedOttoMotion={setSelectedOttoMotion}
            ottoMotionProfileSelector={ottoMotionProfileSelector}
            ottoMotionProfileFields={ottoMotionProfileFields}
            updateOttoMotionDraft={updateOttoMotionDraft}
            restoreOttoMotionDefaults={restoreOttoMotionDefaults}
            testOttoMotionProfile={testOttoMotionProfile}
            saveOttoMotionProfile={saveOttoMotionProfile}
            ottoMotionSaveStatus={ottoMotionSaveStatus}
          />
        );
      case 'optimize':
        return (
          <OptimizePage
            dashboard={dashboard}
            imu={imu}
            gaitTelemetry={gaitTelemetry}
            optimizerForm={optimizerForm}
            updateOptimizerForm={updateOptimizerForm}
            busy={busy}
            handleStartOptimization={handleStartOptimization}
            handleStopOptimization={handleStopOptimization}
            gaitOptimizer={gaitOptimizer}
            gaitConfig={gaitConfig}
          />
        );
      case 'simulation':
        return (
          <SimulationPage
            simulation={dashboard.simulation || defaultState.simulation}
            physicalParams={ottoPhysicalParams}
            updatePhysicalParam={updateOttoPhysicalParam}
            calibrationForm={calibrationForm}
            updateCalibrationForm={updateCalibrationForm}
            busy={busy}
            handleImportSimCad={handleImportSimCad}
            handleSavePhysicalParams={handleSavePhysicalParams}
            handleConnectSimulation={handleConnectSimulation}
            handleDisconnectSimulation={handleDisconnectSimulation}
            handleRunSimulationTrial={handleRunSimulationTrial}
            handleManualCalibration={handleManualCalibration}
            handleRecommendSimulation={handleRecommendSimulation}
            handleExportMuJoCoDraft={handleExportMuJoCoDraft}
            handleRunMuJoCoSimulation={handleRunMuJoCoSimulation}
          />
        );
      case 'simulation-3d':
        return (
          <Suspense fallback={<article className="panel">正在加载 3D 工作台...</article>}>
            <Simulation3DPage
              simulation={dashboard.simulation || defaultState.simulation}
              busy={busy}
              handleExportMuJoCoDraft={handleExportMuJoCoDraft}
              handleRunMuJoCoSimulation={handleRunMuJoCoSimulation}
              handleStopSimulation={handleStopSimulation}
            />
          </Suspense>
        );
      case 'system':
        return <SystemPage dashboard={dashboard} />;
      default:
        return null;
    }
  }

  const activePageMeta = pageTabs.find((item) => item.id === activePage) || pageTabs[0];
  const trimRange = dashboard.runtime.build?.servoTrimRange || {
    min: -30,
    max: 30
  };
  const camera = dashboard.camera || defaultState.camera;
  const imu = dashboard.imu || defaultState.imu;
  const gaitTelemetry = dashboard.gait?.telemetry || defaultState.gait.telemetry;
  const gaitOptimizer = dashboard.gait?.optimizer || defaultState.gait.optimizer;
  const scriptRunner = dashboard.scriptRunner || defaultState.scriptRunner;
  const robotConnected = Boolean(dashboard.robot.connected);
  const build = dashboard.runtime.build;
  const driverReady = Boolean(build?.servoDriverReady);
  const driverStatusLabel = !robotConnected
    ? '未连接'
    : driverReady
      ? 'PCA9685 正常'
      : 'PCA9685 未识别';
  const driverStatusAccent = !robotConnected ? 'warn' : driverReady ? 'good' : 'warn';
  const batteryLabel =
    typeof dashboard.robot.battery === 'number' ? `${dashboard.robot.battery} V` : '--';
  const flashTargetLabel = flashTarget === 'camera' ? '相机模块' : '机器人主控';
  const flashTargetIp = flashTarget === 'camera' ? cameraForm.ip : ip;
  const cameraStreamProxyUrl = camera.baseUrl ? buildApiUrl('/api/camera/stream') : '';
  const cameraSnapshotProxyUrl = camera.baseUrl ? buildApiUrl('/api/camera/snapshot') : '';
  const cameraStatusProxyUrl = camera.baseUrl ? buildApiUrl('/api/camera/status') : '';
  const liveStreamUrl = cameraStreamProxyUrl || camera.streamUrl;
  const snapshotPreviewUrl = cameraSnapshotRequested && cameraSnapshotProxyUrl
    ? appendCacheBuster(cameraSnapshotProxyUrl, cameraSnapshotToken)
    : '';

  return (
    <div className="app-shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <main className="dashboard">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">ESP32 Robot Console</p>
            <h1>机器人图形化控制与 OTA 烧录台</h1>
            <p className="hero-copy">
              本地服务负责烧录、IMU 反馈、相机代理和自动步态优化调度，网页负责实时控制、状态监控和结果可视化。
            </p>
          </div>
          <div className="hero-meta">
            <span className={`pill ${dashboard.robot.connected ? 'online' : 'offline'}`}>
              {dashboard.robot.connected ? '已连接' : '未连接'}
            </span>
            <span className={`pill ${camera.connected ? 'online' : 'offline'}`}>
              {camera.connected ? 'CAM 在线' : 'CAM 未连接'}
            </span>
            <span className={`pill ${imu.available ? 'online' : 'offline'}`}>
              {imu.available ? 'IMU 在线' : 'IMU 未就绪'}
            </span>
            <span className="pill subtle">浏览器客户端 {dashboard.service.connectedClients}</span>
          </div>
        </section>

        {toast ? (
          <div className="toast" onAnimationEnd={() => setToast('')}>
            {toast}
          </div>
        ) : null}

        <section className="page-nav-panel">
          <div className="page-nav-copy">
            <p className="eyebrow">功能页面</p>
            <h2>{activePageMeta.label}</h2>
            <p className="page-nav-description">{activePageMeta.description}</p>
          </div>

          <div className="page-tab-list" role="tablist" aria-label="功能页面切换">
            {pageTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activePage === item.id}
                className={`page-tab ${activePage === item.id ? 'selected' : 'ghost'}`}
                onClick={() => navigateToPage(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="page-summary-grid global-status-panel">
          <StatusCard
            label="机器人"
            value={dashboard.robot.connected ? '已连接' : '未连接'}
            accent={dashboard.robot.connected ? 'good' : 'warn'}
          />
          <StatusCard
            label="机器人 IP"
            value={dashboard.robot.ip || dashboard.runtime.network?.ip || '--'}
          />
          <StatusCard
            label="舵机驱动"
            value={driverStatusLabel}
            accent={driverStatusAccent}
          />
          <StatusCard
            label="控制延迟"
            value={formatValue(dashboard.robot.latencyMs, ' ms')}
            accent={
              typeof dashboard.robot.latencyMs === 'number' && dashboard.robot.latencyMs <= 120
                ? 'good'
                : undefined
            }
          />
          <StatusCard label="电池电压" value={batteryLabel} />
          <StatusCard
            label="相机"
            value={camera.connected ? '在线' : '未连接'}
            accent={camera.connected ? 'good' : 'warn'}
          />
          <StatusCard
            label="IMU"
            value={imu.available ? '在线' : '未就绪'}
            accent={imu.available ? 'good' : 'warn'}
          />
          <StatusCard
            label="脚本"
            value={scriptRunner.running ? '运行中' : scriptRunner.statusMessage || '空闲'}
            accent={scriptRunner.running ? 'good' : scriptRunner.lastError ? 'warn' : undefined}
          />
          <StatusCard
            label="优化器"
            value={gaitOptimizer.running ? '运行中' : gaitOptimizer.status || '空闲'}
            accent={gaitOptimizer.running ? 'good' : 'warn'}
          />
        </section>

        {renderActivePage()}
      </main>
    </div>
  );
}
