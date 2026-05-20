import { ottoStableMoveButtons } from '../../shared/otto-controls.js';

export const defaultGaitConfig = {
  defaults: {
    target: 'stability',
    maxTrials: 18,
    trialDurationMs: 3200,
    settleTimeMs: 1200
  },
  parameterSchema: []
};

export const defaultOptimizerForm = {
  target: 'stability',
  maxTrials: 18,
  trialDurationMs: 3200,
  settleTimeMs: 1200
};

export const defaultOttoPhysicalParams = {
  totalMassKg: 0.42,
  legLengthMm: 55,
  footLengthMm: 70,
  footWidthMm: 40,
  centerOfMassHeightMm: 82,
  servoMaxSpeedDegPerSec: 420,
  servoTorqueKgCm: 1.8,
  footFriction: 0.72,
  nominalStrideScale: 1
};

export const defaultCalibrationForm = {
  distanceMeters: 0.3,
  durationMs: 4000,
  fallen: false
};

export const defaultCameraForm = {
  ip: '192.168.10.11',
  label: 'ESP32-CAM',
  streamPath: '/stream',
  snapshotPath: '/capture',
  statusPath: '/status',
  otaPath: '/update'
};

export const defaultState = {
  service: {
    startedAt: null,
    connectedClients: 0
  },
  robot: {
    ip: '',
    connected: false,
    mode: 'disconnected',
    battery: null,
    latencyMs: null,
    signalStrength: null,
    firmwareVersion: 'unknown',
    lastSeenAt: null,
    otaInProgress: false
  },
  firmware: {
    fileName: '',
    filePath: '',
    fileSize: 0,
    uploadedAt: null,
    progress: 0,
    lastResult: null,
    lastTarget: 'robot',
    lastMode: null
  },
  serial: {
    ports: [],
    recommendedPort: '',
    lastScanAt: null
  },
  runtime: {
    build: null,
    capabilities: {
      modules: [],
      actions: [],
      moves: [],
      servoIds: []
    },
    network: null
  },
  boundaryGuard: {
    enabled: false,
    configured: false,
    active: false,
    leftFront: false,
    rightFront: false,
    leftRear: false,
    rightRear: false,
    lastTrigger: '',
    lastTriggeredAt: 0
  },
  ultrasonic: {
    enabled: false,
    configured: false,
    centerCm: null,
    leftCm: null,
    rightCm: null,
    centerValid: false,
    leftValid: false,
    rightValid: false,
    centerNear: false,
    leftNear: false,
    rightNear: false,
    centerDanger: false,
    leftDanger: false,
    rightDanger: false,
    nearThresholdCm: 12,
    dangerThresholdCm: 8,
    lastReadAt: 0,
    lastCenterReadAt: 0,
    lastLeftReadAt: 0,
    lastRightReadAt: 0,
    lastUpdatedAt: null
  },
  camera: {
    label: 'ESP32-CAM',
    ip: '',
    baseUrl: '',
    connected: false,
    status: 'disconnected',
    latencyMs: null,
    streamPath: '/stream',
    snapshotPath: '/capture',
    statusPath: '/status',
    otaPath: '/update',
    streamUrl: '',
    snapshotUrl: '',
    statusUrl: '',
    otaUrl: '',
    framesize: null,
    quality: null,
    brightness: null,
    contrast: null,
    saturation: null,
    specialEffect: null,
    wbMode: null,
    detection: null,
    lastCheckedAt: null,
    lastError: null,
    otaInProgress: false
  },
  imu: {
    available: false,
    roll: null,
    pitch: null,
    yaw: null,
    accel: {
      x: null,
      y: null,
      z: null
    },
    gyro: {
      x: null,
      y: null,
      z: null
    },
    temperature: null,
    calibrated: false,
    fallen: false,
    lastUpdatedAt: null
  },
  gait: {
    telemetry: {
      available: false,
      phase: 'idle',
      stepCount: 0,
      forwardProgress: null,
      lateralDrift: null,
      yawDrift: null,
      stabilityScore: null,
      fallen: false,
      ottoStraightAssistActive: false,
      ottoStraightDiagnosticAvailable: false,
      ottoStraightDiagnosticRunning: false,
      ottoBaselineYaw: null,
      ottoCurrentYaw: null,
      ottoYawError: null,
      ottoMaxAbsYawError: null,
      ottoYawDirection: 'straight',
      ottoElapsedMs: 0,
      lastUpdatedAt: null
    },
    optimizer: {
      running: false,
      status: 'idle',
      statusMessage: '等待开始',
      target: 'stability',
      maxTrials: 0,
      trialDurationMs: 0,
      settleTimeMs: 0,
      currentTrial: 0,
      currentParams: null,
      currentScore: null,
      bestScore: null,
      bestParams: null,
      startedAt: null,
      finishedAt: null,
      history: []
    }
  },
  simulation: {
    connected: false,
    profileId: '',
    modelStatus: 'not_imported',
    statusMessage: '等待导入 OTTO 仿真模型',
    profiles: {},
    currentParams: null,
    servoAngles: {},
    metrics: {
      phase: 'idle',
      speedMps: null,
      forwardProgress: null,
      stepCount: 0,
      strideMeters: null,
      cadenceStepsPerSecond: null,
      stabilityScore: null,
      fallRisk: null,
      lateralDrift: null,
      yawDrift: null,
      fallen: false,
      confidence: 'uncalibrated',
      updatedAt: null
    },
    calibration: {
      manualSamples: [],
      speedScale: 1,
      lastManualSampleAt: null
    },
    tracking: {
      mode: 'overhead_marker',
      available: false,
      status: 'not_started',
      lastSampleAt: null,
      message: '第一版预留俯视 ArUco 标记追踪；摄像头不可用时使用手动录入。'
    },
    digitalTwin: {
      engine: 'mujoco',
      status: 'not_exported',
      profileId: '',
      sourceCad: '',
      modelName: '',
      xml: '',
      exportedAt: null,
      runtime: {
        loaded: false,
        backend: '',
        mujocoVersion: '',
        stepCount: 0,
        durationMs: 0,
        forwardProgress: null,
        lateralDrift: null,
        finalRootZ: null,
        speedMps: null,
        fallen: false,
        ranAt: null
      },
      todo: []
    },
    recommendations: [],
    history: []
  },
  scriptRunner: {
    running: false,
    status: 'idle',
    statusMessage: '等待脚本',
    prompt: '',
    targetServoId: 7,
    targetIp: '',
    currentStep: '',
    loopIteration: 0,
    loopCount: 0,
    summary: [],
    startedAt: null,
    finishedAt: null,
    lastError: null
  },
  finalRun: {
    task: 'task1',
    targetLabel: 'red_cube',
    status: 'idle',
    phase: 'idle',
    phaseLabel: '等待启动',
    lastAction: null,
    startedAt: null,
    stoppedAt: null,
    resumedAt: null,
    updatedAt: null
  },
  pcBrain: {
    status: 'idle',
    task: 'task1',
    source: 'opencv',
    targetLabel: '',
    startedAt: null,
    stoppedAt: null,
    updatedAt: null,
    lastVisionAt: null,
    lastFrameId: null,
    lastDetectionCount: 0,
    frameCount: 0,
    ignoredVisionCount: 0,
    lastVisionIgnoredReason: '',
    lastStopReason: '',
    externalBrain: {
      model: '',
      scene: 'uncertain',
      confidence: 0,
      suggestedAction: 'none',
      reason: '',
      latencyMs: null,
      updatedAt: null
    }
  },
  servoAngles: {
    1: 90,
    2: 90,
    3: 90,
    4: 90,
    5: 90,
    6: 90,
    7: 90,
    8: 90,
    9: 90
  },
  logs: []
};

export const servoControls = [
  { id: 1, label: '左膝', channel: 15 },
  { id: 2, label: '右膝', channel: 0 },
  { id: 3, label: '左胯zy', channel: 12 },
  { id: 4, label: '右胯zy', channel: 3 },
  { id: 5, label: '左胯qh', channel: 9 },
  { id: 6, label: '右胯qh', channel: 6 },
  { id: 7, label: '脖子（未接）', channel: 14 },
  { id: 8, label: '其他', channel: 4 }
];

export const ottoServoControls = [
  { id: 1, label: '左腿', channel: 15 },
  { id: 2, label: '右腿', channel: 0 },
  { id: 9, label: '左胯', channel: 11 },
  { id: 8, label: '右胯', channel: 4 }
];

export const allServoControls = Array.from(
  new Map([...servoControls, ...ottoServoControls].map((control) => [control.id, control])).values()
);

export const defaultServoTrimDrafts = Object.fromEntries(
  allServoControls.map(({ id }) => [id, 0])
);

export const defaultScriptPrompt = `启动
  初始化舵机
  把舵机打到 90 度
循环
  转到 70 度
  延时
  转到 110 度
  延时
  回到 90 度`;

export const ottoMotionProfileFields = [
  { id: 'leftLegAmplitudeDeg', label: '左腿幅度', min: 0, max: 30, step: 0.1 },
  { id: 'rightLegAmplitudeDeg', label: '右腿幅度', min: 0, max: 30, step: 0.1 },
  { id: 'leftHipAmplitudeDeg', label: '左胯幅度', min: 0, max: 30, step: 0.1 },
  { id: 'rightHipAmplitudeDeg', label: '右胯幅度', min: 0, max: 30, step: 0.1 }
];

export const ottoMotionProfileDefaults = {
  otto_forward: {
    leftLegAmplitudeDeg: 12,
    rightLegAmplitudeDeg: 11.6,
    leftHipAmplitudeDeg: 18,
    rightHipAmplitudeDeg: 18.2
  },
  otto_async_forward: {
    leftLegAmplitudeDeg: 10.2,
    rightLegAmplitudeDeg: 7.6,
    leftHipAmplitudeDeg: 15.3,
    rightHipAmplitudeDeg: 11.9
  },
  otto_backward: {
    leftLegAmplitudeDeg: 12,
    rightLegAmplitudeDeg: 10.5,
    leftHipAmplitudeDeg: 18,
    rightHipAmplitudeDeg: 16.5
  },
  otto_async_backward: {
    leftLegAmplitudeDeg: 12,
    rightLegAmplitudeDeg: 10.5,
    leftHipAmplitudeDeg: 18,
    rightHipAmplitudeDeg: 16.5
  },
  otto_left: {
    leftLegAmplitudeDeg: 12,
    rightLegAmplitudeDeg: 12,
    leftHipAmplitudeDeg: 18,
    rightHipAmplitudeDeg: 18
  },
  otto_right: {
    leftLegAmplitudeDeg: 12,
    rightLegAmplitudeDeg: 12,
    leftHipAmplitudeDeg: 18,
    rightHipAmplitudeDeg: 18
  },
  otto_shift_left: {
    leftLegAmplitudeDeg: 8,
    rightLegAmplitudeDeg: 8,
    leftHipAmplitudeDeg: 16,
    rightHipAmplitudeDeg: 16
  },
  otto_shift_right: {
    leftLegAmplitudeDeg: 8,
    rightLegAmplitudeDeg: 8,
    leftHipAmplitudeDeg: 16,
    rightHipAmplitudeDeg: 16
  }
};

export const ottoMotionProfileSelector = [
  { id: 'otto_forward', label: '同步直行' },
  { id: 'otto_async_forward', label: '异步直行' },
  { id: 'otto_backward', label: '同步后退' },
  { id: 'otto_async_backward', label: '异步后退' },
  { id: 'otto_left', label: '左转' },
  { id: 'otto_right', label: '右转' },
  { id: 'otto_shift_left', label: '左修正' },
  { id: 'otto_shift_right', label: '右修正' }
];

export function createOttoMotionProfileDrafts(source = ottoMotionProfileDefaults) {
  return Object.fromEntries(
    ottoMotionProfileSelector.map(({ id }) => [
      id,
      {
        ...ottoMotionProfileDefaults[id],
        ...(source?.[id] || {})
      }
    ])
  );
}

export const actionButtons = [
  {
    label: '企鹅步测试',
    payload: {
      type: 'gait_trial_start',
      gaitName: 'penguin_walk',
      durationMs: 0,
      params: {
        leanAngleDeg: 6,
        hipSwingDeg: 9,
        kneeLiftDeg: 10,
        stanceKneeDeg: 102,
        doubleSupportMs: 260,
        swingPhaseMs: 520,
        torsoLeadDeg: 1,
        neckTrimDeg: 1
      }
    }
  },
  {
    label: '横移步',
    payload: { type: 'action', name: 'lateral_step' }
  },
  {
    label: '停止步态',
    payload: { type: 'gait_trial_stop', gaitName: 'penguin_walk' }
  },
  { label: '站立', payload: { type: 'action', name: 'stand' } },
  { label: '下蹲', payload: { type: 'action', name: 'squat' } },
  { label: '回中', payload: { type: 'action', name: 'center' } },
  { label: '急停', payload: { type: 'emergency_stop' }, danger: true }
];

export const moveButtons = [
  { label: '步态1', payload: { type: 'move', direction: 'forward', speed: 40 } },
  { label: '停止', payload: { type: 'move', direction: 'stop', speed: 0 } },
  { label: '步态2', payload: { type: 'move', direction: 'forward_2', speed: 40 } }
];

export const ottoMoveButtons = ottoStableMoveButtons;

const aggressiveForwardPeriodMs = 1050;
const aggressivePeriodMs = 1100;
const testPeriodMs = 950;

export const ottoAggressiveMoveButtons = [
  {
    label: '同步直行',
    payload: {
      type: 'move',
      direction: 'otto_forward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressiveForwardPeriodMs,
        leftLegAmplitudeDeg: 10.5,
        rightLegAmplitudeDeg: 11.2,
        leftHipAmplitudeDeg: 18.5,
        rightHipAmplitudeDeg: 19.5
      }
    }
  },
  {
    label: '异步直行',
    payload: {
      type: 'move',
      direction: 'otto_async_forward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 10.2,
        rightLegAmplitudeDeg: 8.6,
        leftHipAmplitudeDeg: 17,
        rightHipAmplitudeDeg: 14.4
      }
    }
  },
  {
    label: '同步后退',
    payload: {
      type: 'move',
      direction: 'otto_backward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      }
    }
  },
  {
    label: '异步后退',
    payload: {
      type: 'move',
      direction: 'otto_async_backward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      }
    }
  },
  {
    label: '左转',
    payload: {
      type: 'move',
      direction: 'otto_left',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      }
    }
  },
  {
    label: '右转',
    payload: {
      type: 'move',
      direction: 'otto_right',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      }
    }
  },
  {
    label: '左修正',
    payload: {
      type: 'move',
      direction: 'otto_shift_left',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 12,
        rightHipAmplitudeDeg: 12
      }
    }
  },
  {
    label: '右修正',
    payload: {
      type: 'move',
      direction: 'otto_shift_right',
      speed: 60,
      ottoMotionProfile: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 12,
        rightHipAmplitudeDeg: 12
      }
    }
  },
  { label: '停止', payload: { type: 'move', direction: 'otto_stop', speed: 0 } }
];

export const ottoBowlingTacticButton = {
  label: '保龄球战术',
  payload: {
    type: 'move',
    direction: 'otto_bowling_tactic',
    speed: 60,
    ottoMotionProfiles: {
      forward: {
        periodMs: aggressiveForwardPeriodMs,
        leftLegAmplitudeDeg: 10.5,
        rightLegAmplitudeDeg: 11.2,
        leftHipAmplitudeDeg: 18.5,
        rightHipAmplitudeDeg: 19.5
      },
      turnLeft: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      },
      turnRight: {
        periodMs: aggressivePeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 20,
        rightHipAmplitudeDeg: 20
      }
    }
  }
};

export const ottoTestMoveButtons = [
  {
    label: '同步直行',
    payload: {
      type: 'move',
      direction: 'otto_forward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: testPeriodMs,
        leftLegAmplitudeDeg: 10.5,
        rightLegAmplitudeDeg: 11.2,
        leftHipAmplitudeDeg: 18,
        rightHipAmplitudeDeg: 19
      }
    }
  },
  {
    label: '同步后退',
    payload: {
      type: 'move',
      direction: 'otto_backward',
      speed: 60,
      ottoMotionProfile: {
        periodMs: testPeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 10.5,
        leftHipAmplitudeDeg: 18,
        rightHipAmplitudeDeg: 16.5
      }
    }
  },
  {
    label: '左快',
    payload: {
      type: 'move',
      direction: 'otto_left_fast',
      speed: 60,
      ottoMotionProfile: {
        periodMs: testPeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 18,
        rightHipAmplitudeDeg: 18
      }
    }
  },
  {
    label: '右转',
    payload: {
      type: 'move',
      direction: 'otto_right',
      speed: 60,
      ottoMotionProfile: {
        periodMs: testPeriodMs,
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 12,
        leftHipAmplitudeDeg: 18,
        rightHipAmplitudeDeg: 18
      }
    }
  }
];

export const finalRunTargetLabels = [
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

export const pageTabs = [
  {
    id: 'overview',
    label: '连接与烧录',
    description: '管理机器人连接、固件上传和 OTA / USB 烧录。'
  },
  {
    id: 'final-go',
    label: 'Final go!',
    description: '抽签后选择目标物块，并控制最终全流程开始、停止和继续。'
  },
  {
    id: 'task1',
    label: 'task1',
    description: 'Task1 调试页面。'
  },
  {
    id: 'control',
    label: '实时控制',
    description: '发送动作命令，调节舵机角度并执行零位校准。'
  },
  {
    id: 'otto-control',
    label: '实时控制区(Otto)',
    description: '使用 Otto 正弦步态控制 4 个腿部舵机。'
  },
  {
    id: 'optimize',
    label: '步态优化',
    description: '结合 IMU 反馈观察状态并执行自动步态调参。'
  },
  {
    id: 'simulation',
    label: 'OTTO 仿真',
    description: '用 2D 物理指标模型评估 OTTO 步态速度、稳定性和校准结果。'
  },
  {
    id: 'simulation-3d',
    label: '3D 工作台',
    description: '独立查看 OTTO 近似 3D 场景、MuJoCo 运行状态和步态播放。'
  },
  {
    id: 'system',
    label: '系统状态',
    description: '查看固件能力、网络信息和统一日志输出。'
  }
];

export function normalizePageId(pageId) {
  return pageTabs.some((item) => item.id === pageId) ? pageId : pageTabs[0].id;
}

export function getPageFromHash() {
  if (typeof window === 'undefined') {
    return pageTabs[0].id;
  }

  return normalizePageId(window.location.hash.replace('#', ''));
}

export function formatValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return `${value}${suffix}`;
}

export function formatSignedValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}${suffix}`;
}

export function formatTime(isoString) {
  if (!isoString) {
    return '--';
  }

  return new Date(isoString).toLocaleString('zh-CN', {
    hour12: false
  });
}

export function formatParameterValue(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return key.endsWith('Ms') ? `${value} ms` : `${value}°`;
}

export function appendCacheBuster(url, token) {
  if (!url) {
    return '';
  }

  return `${url}${url.includes('?') ? '&' : '?'}t=${token}`;
}

export function StatusCard({ label, value, accent }) {
  return (
    <div className="status-card">
      <span className="status-label">{label}</span>
      <strong className={`status-value ${accent || ''}`}>{value}</strong>
    </div>
  );
}

export function Chip({ children }) {
  return <span className="capability-chip">{children}</span>;
}
