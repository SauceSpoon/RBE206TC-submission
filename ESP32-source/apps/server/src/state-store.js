import { EventEmitter } from 'node:events';

function createInitialState() {
  return {
    service: {
      startedAt: new Date().toISOString(),
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
      8: 90
    },
    logs: []
  };
}

function createDisconnectedRuntimeState() {
  const initial = createInitialState();

  return {
    imu: initial.imu,
    ultrasonic: initial.ultrasonic,
    gaitTelemetry: initial.gait.telemetry,
    scriptRunner: initial.scriptRunner
  };
}

export class StateStore extends EventEmitter {
  constructor() {
    super();
    this.state = createInitialState();
  }

  snapshot() {
    return structuredClone(this.state);
  }

  setConnectedClients(count) {
    this.state.service.connectedClients = count;
    this.emit('status', this.snapshot());
  }

  updateRobot(partial) {
    this.state.robot = {
      ...this.state.robot,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateFirmware(partial) {
    this.state.firmware = {
      ...this.state.firmware,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateSerial(partial) {
    this.state.serial = {
      ...this.state.serial,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateCamera(partial) {
    this.state.camera = {
      ...this.state.camera,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateImu(partial) {
    this.state.imu = {
      ...this.state.imu,
      ...partial,
      accel: {
        ...this.state.imu.accel,
        ...partial?.accel
      },
      gyro: {
        ...this.state.imu.gyro,
        ...partial?.gyro
      }
    };
    this.emit('status', this.snapshot());
  }

  updateGaitTelemetry(partial) {
    this.state.gait.telemetry = {
      ...this.state.gait.telemetry,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateOptimizer(partial) {
    this.state.gait.optimizer = {
      ...this.state.gait.optimizer,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateSimulation(partial) {
    this.state.simulation = {
      ...this.state.simulation,
      ...partial,
      metrics: {
        ...this.state.simulation.metrics,
        ...(partial?.metrics || {})
      },
      calibration: {
        ...this.state.simulation.calibration,
        ...(partial?.calibration || {})
      },
      tracking: {
        ...this.state.simulation.tracking,
        ...(partial?.tracking || {})
      },
      digitalTwin: {
        ...this.state.simulation.digitalTwin,
        ...(partial?.digitalTwin || {})
      },
      profiles: {
        ...this.state.simulation.profiles,
        ...(partial?.profiles || {})
      }
    };
    this.emit('status', this.snapshot());
  }

  updateScriptRunner(partial) {
    this.state.scriptRunner = {
      ...this.state.scriptRunner,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateFinalRun(partial) {
    this.state.finalRun = {
      ...this.state.finalRun,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updatePcBrain(partial) {
    this.state.pcBrain = {
      ...this.state.pcBrain,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateServo(id, angle) {
    this.state.servoAngles = {
      ...this.state.servoAngles,
      [id]: angle
    };
    this.emit('status', this.snapshot());
  }

  resetRobotRuntimeState({ resetScriptRunner = true } = {}) {
    const disconnected = createDisconnectedRuntimeState();
    this.state.imu = disconnected.imu;
    this.state.ultrasonic = disconnected.ultrasonic;
    this.state.gait.telemetry = disconnected.gaitTelemetry;
    if (resetScriptRunner) {
      this.state.scriptRunner = disconnected.scriptRunner;
    }
    this.emit('status', this.snapshot());
  }

  applyRobotStatus(payload) {
    const nextRobot = {
      ...this.state.robot,
      connected: true,
      lastSeenAt: new Date().toISOString()
    };

    if (typeof payload.mode === 'string') {
      nextRobot.mode = payload.mode;
    }

    if (typeof payload.battery === 'number') {
      nextRobot.battery = payload.battery;
    }

    if (typeof payload.signalStrength === 'number') {
      nextRobot.signalStrength = payload.signalStrength;
    }

    if (typeof payload.latencyMs === 'number') {
      nextRobot.latencyMs = payload.latencyMs;
    }

    if (typeof payload.firmwareVersion === 'string') {
      nextRobot.firmwareVersion = payload.firmwareVersion;
    }

    if (typeof payload.otaInProgress === 'boolean') {
      nextRobot.otaInProgress = payload.otaInProgress;
    }

    if (payload.servoAngles && typeof payload.servoAngles === 'object') {
      this.state.servoAngles = {
        ...this.state.servoAngles,
        ...payload.servoAngles
      };
    }

    if (payload.build && typeof payload.build === 'object') {
      this.state.runtime.build = payload.build;
    }

    if (payload.ottoMotionProfiles && typeof payload.ottoMotionProfiles === 'object') {
      this.state.runtime.build = {
        ...(this.state.runtime.build || {}),
        ottoMotionProfiles: payload.ottoMotionProfiles
      };
    }

    if (payload.capabilities && typeof payload.capabilities === 'object') {
      this.state.runtime.capabilities = {
        ...this.state.runtime.capabilities,
        ...payload.capabilities
      };
    }

    if (payload.network && typeof payload.network === 'object') {
      this.state.runtime.network = payload.network;
    }

    if (payload.boundaryGuard && typeof payload.boundaryGuard === 'object') {
      this.state.boundaryGuard = {
        ...this.state.boundaryGuard,
        ...payload.boundaryGuard
      };
    }

    if (payload.ultrasonic && typeof payload.ultrasonic === 'object') {
      this.state.ultrasonic = {
        ...this.state.ultrasonic,
        ...payload.ultrasonic,
        lastUpdatedAt: payload.ultrasonic.lastUpdatedAt || new Date().toISOString()
      };
    }

    if (payload.imu && typeof payload.imu === 'object') {
      this.state.imu = {
        ...this.state.imu,
        ...payload.imu,
        available:
          Boolean(payload.imu.available) ||
          typeof payload.imu.roll === 'number' ||
          typeof payload.imu.pitch === 'number' ||
          typeof payload.imu.yaw === 'number',
        accel: {
          ...this.state.imu.accel,
          ...(payload.imu.accel && typeof payload.imu.accel === 'object' ? payload.imu.accel : {})
        },
        gyro: {
          ...this.state.imu.gyro,
          ...(payload.imu.gyro && typeof payload.imu.gyro === 'object' ? payload.imu.gyro : {})
        },
        lastUpdatedAt: payload.imu.lastUpdatedAt || new Date().toISOString()
      };
    }

    if (payload.gaitTelemetry && typeof payload.gaitTelemetry === 'object') {
      this.state.gait.telemetry = {
        ...this.state.gait.telemetry,
        ...payload.gaitTelemetry,
        available: true,
        lastUpdatedAt: payload.gaitTelemetry.lastUpdatedAt || new Date().toISOString()
      };
    }

    this.state.robot = nextRobot;
    this.emit('status', this.snapshot());
  }

  addLog(level, message, meta = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    };

    this.state.logs = [...this.state.logs.slice(-199), entry];
    this.emit('log', entry);
  }
}
