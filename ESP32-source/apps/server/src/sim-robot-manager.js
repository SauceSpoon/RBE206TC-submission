import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

const OTTO_CAD_ROOT = path.resolve(REPO_ROOT, '现在机器人模型');

const DEFAULT_SERVO_ANGLES = {
  1: 90,
  2: 90,
  8: 90,
  9: 90
};

const DEFAULT_PHYSICAL_PARAMS = {
  totalMassKg: 0.42,
  legLengthMm: 55,
  footLengthMm: 70,
  footWidthMm: 40,
  centerOfMassHeightMm: 82,
  servoMaxSpeedDegPerSec: 420,
  servoTorqueKgCm: 1.8,
  footFriction: 0.72,
  nominalStrideScale: 1,
  mujocoReady: false
};

export const OTTO_PROFILE = {
  id: 'otto',
  label: '重建 OTTO',
  description: '按作业尺寸重新建模的 OTTO 双足机器人，第一版仿真默认只支持该模型。',
  cadSources: [
    path.join(OTTO_CAD_ROOT, 'otto_odk.STEP')
  ],
  physicalParams: DEFAULT_PHYSICAL_PARAMS,
  gaitDefaults: {
    hipSwingDeg: 12,
    kneeLiftDeg: 16,
    doubleSupportMs: 220,
    swingPhaseMs: 420,
    torsoLeadDeg: 1
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

function nowIso() {
  return new Date().toISOString();
}

function buildInitialProfile() {
  return {
    ...OTTO_PROFILE,
    modelStatus: 'not_imported',
    geometry: {
      primaryCad: OTTO_PROFILE.cadSources[0],
      cadRoot: OTTO_CAD_ROOT,
      fileSizeBytes: 0,
      sources: OTTO_PROFILE.cadSources,
      summary: '等待导入重建 OTTO CAD'
    },
    physicalParams: {
      ...DEFAULT_PHYSICAL_PARAMS
    }
  };
}

function normalizeParams(params = {}, fallback = OTTO_PROFILE.gaitDefaults) {
  return {
    hipSwingDeg: clamp(Number(params.hipSwingDeg ?? fallback.hipSwingDeg), 4, 28),
    kneeLiftDeg: clamp(Number(params.kneeLiftDeg ?? fallback.kneeLiftDeg), 4, 32),
    doubleSupportMs: clamp(Number(params.doubleSupportMs ?? fallback.doubleSupportMs), 80, 520),
    swingPhaseMs: clamp(Number(params.swingPhaseMs ?? fallback.swingPhaseMs), 160, 900),
    torsoLeadDeg: clamp(Number(params.torsoLeadDeg ?? fallback.torsoLeadDeg), -8, 12)
  };
}

function estimateMetrics({ params, physicalParams, durationMs, speedScale = 1, fallen = false }) {
  const cycleMs = Math.max(240, params.doubleSupportMs * 2 + params.swingPhaseMs * 2);
  const durationSeconds = Math.max(0.2, Number(durationMs || 3000) / 1000);
  const stepCount = Math.max(1, Math.floor((durationSeconds * 1000 * 2) / cycleMs));
  const strideMeters =
    (physicalParams.legLengthMm / 1000) *
    Math.sin((params.hipSwingDeg * Math.PI) / 180) *
    1.85 *
    physicalParams.nominalStrideScale;
  const cadenceStepsPerSecond = stepCount / durationSeconds;
  const rawSpeedMps = strideMeters * cadenceStepsPerSecond * speedScale;
  const leanPenalty = Math.abs(params.torsoLeadDeg) * 0.018;
  const swingPenalty = Math.max(0, params.hipSwingDeg - 18) * 0.025;
  const supportBonus = clamp((params.doubleSupportMs - 80) / 420, 0, 1) * 0.24;
  const frictionBonus = clamp(physicalParams.footFriction, 0.2, 1.1) * 0.2;
  const stabilityScore = clamp(0.62 + supportBonus + frictionBonus - leanPenalty - swingPenalty, 0, 1);
  const fallRisk = clamp((1 - stabilityScore) + Math.max(0, rawSpeedMps - 0.18) * 1.6, 0, 1);
  const forwardProgress = rawSpeedMps * durationSeconds;

  return {
    phase: 'simulated_otto_walk',
    speedMps: round(rawSpeedMps),
    forwardProgress: round(forwardProgress),
    stepCount,
    strideMeters: round(strideMeters),
    cadenceStepsPerSecond: round(cadenceStepsPerSecond),
    stabilityScore: round(fallen ? 0 : stabilityScore),
    fallRisk: round(fallen ? 1 : fallRisk),
    lateralDrift: round((params.hipSwingDeg - 12) * 0.0015),
    yawDrift: round(params.torsoLeadDeg * 0.8, 2),
    fallen: Boolean(fallen || fallRisk > 0.86),
    confidence: speedScale === 1 ? 'uncalibrated' : 'calibrated',
    updatedAt: nowIso()
  };
}

function buildImuFromMetrics(metrics) {
  return {
    available: true,
    calibrated: true,
    fallen: metrics.fallen,
    roll: round(metrics.lateralDrift * 160, 2),
    pitch: round(metrics.yawDrift * 0.35, 2),
    yaw: round(metrics.yawDrift, 2),
    accel: {
      x: round(metrics.speedMps * 0.1),
      y: round(metrics.lateralDrift),
      z: 1
    },
    gyro: {
      x: 0,
      y: 0,
      z: round(metrics.yawDrift * 0.05)
    },
    lastUpdatedAt: metrics.updatedAt
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMuJoCoXml({ profile, physicalParams }) {
  const mass = Number(physicalParams.totalMassKg || DEFAULT_PHYSICAL_PARAMS.totalMassKg);
  const bodyMass = round(mass * 0.42, 3);
  const legMass = round(mass * 0.13, 3);
  const footMass = round(mass * 0.08, 3);
  const legLength = round((physicalParams.legLengthMm || 55) / 1000, 4);
  const footLength = round((physicalParams.footLengthMm || 70) / 1000, 4);
  const footWidth = round((physicalParams.footWidthMm || 40) / 1000, 4);
  const comHeight = round((physicalParams.centerOfMassHeightMm || 82) / 1000, 4);
  const torque = round((physicalParams.servoTorqueKgCm || 1.8) * 0.0980665, 3);
  const friction = round(physicalParams.footFriction || 0.72, 3);
  const sourceCad = escapeXml(profile.geometry.primaryCad);

  return `<?xml version="1.0" encoding="UTF-8"?>
<mujoco model="rebuilt_otto">
  <compiler angle="degree" coordinate="local"/>
  <option timestep="0.005" gravity="0 0 -9.81"/>
  <custom>
    <text name="source_cad" data="${sourceCad}"/>
    <text name="mesh_status" data="STEP mesh conversion pending"/>
  </custom>
  <default>
    <joint damping="0.08" armature="0.01" limited="true"/>
    <geom rgba="0.72 0.78 0.84 1" friction="${friction} 0.02 0.001"/>
    <motor ctrllimited="true" ctrlrange="-1 1"/>
  </default>
  <asset>
    <!-- STEP mesh import is intentionally pending until an OCCT/mesh conversion pipeline is added. -->
    <material name="pla_print" rgba="0.86 0.88 0.9 1"/>
    <material name="electronics" rgba="0.08 0.12 0.16 1"/>
  </asset>
  <worldbody>
    <geom name="floor" type="plane" size="1.2 1.2 0.02" rgba="0.18 0.2 0.22 1" friction="${friction} 0.02 0.001"/>
    <body name="torso" pos="0 0 ${comHeight}">
      <freejoint name="root"/>
      <inertial pos="0 0 0" mass="${bodyMass}" diaginertia="0.0012 0.0012 0.001"/>
      <geom name="body_shell" type="box" size="0.035 0.025 0.035" material="pla_print"/>
      <geom name="electronics_stack" type="box" pos="0 0 0.012" size="0.026 0.018 0.008" material="electronics"/>
      <body name="left_leg" pos="0 0.022 -0.02">
        <joint name="left_leg_pitch" type="hinge" axis="0 1 0" range="-45 45"/>
        <geom name="left_leg_link" type="capsule" fromto="0 0 0 0 0 -${legLength}" size="0.009" mass="${legMass}" material="pla_print"/>
        <body name="left_foot_body" pos="0 0 -${legLength}">
          <joint name="left_hip_roll" type="hinge" axis="1 0 0" range="-35 35"/>
          <geom name="left_foot" type="box" pos="0.01 0 -0.006" size="${round(footLength / 2, 4)} ${round(footWidth / 2, 4)} 0.006" mass="${footMass}" material="pla_print"/>
        </body>
      </body>
      <body name="right_leg" pos="0 -0.022 -0.02">
        <joint name="right_leg_pitch" type="hinge" axis="0 1 0" range="-45 45"/>
        <geom name="right_leg_link" type="capsule" fromto="0 0 0 0 0 -${legLength}" size="0.009" mass="${legMass}" material="pla_print"/>
        <body name="right_foot_body" pos="0 0 -${legLength}">
          <joint name="right_hip_roll" type="hinge" axis="1 0 0" range="-35 35"/>
          <geom name="right_foot" type="box" pos="0.01 0 -0.006" size="${round(footLength / 2, 4)} ${round(footWidth / 2, 4)} 0.006" mass="${footMass}" material="pla_print"/>
        </body>
      </body>
    </body>
  </worldbody>
  <actuator>
    <motor name="left_leg_servo" joint="left_leg_pitch" gear="${torque}"/>
    <motor name="right_leg_servo" joint="right_leg_pitch" gear="${torque}"/>
    <motor name="left_hip_servo" joint="left_hip_roll" gear="${torque}"/>
    <motor name="right_hip_servo" joint="right_hip_roll" gear="${torque}"/>
  </actuator>
</mujoco>
`;
}

function runPythonMuJoCo(payload, { timeoutMs = 8000 } = {}) {
  const script = `
import json
import math
import sys

import mujoco

payload = json.load(sys.stdin)
model = mujoco.MjModel.from_xml_string(payload["xml"])
data = mujoco.MjData(model)
params = payload.get("params") or {}
duration_ms = float(payload.get("durationMs") or 300)
steps = max(1, int((duration_ms / 1000.0) / model.opt.timestep))
cycle_ms = max(240.0, (float(params.get("doubleSupportMs") or 220) + float(params.get("swingPhaseMs") or 420)) * 2.0)
amp = max(0.05, min(1.0, float(params.get("hipSwingDeg") or 12) / 28.0))
roll_amp = max(0.04, min(0.8, float(params.get("kneeLiftDeg") or 16) / 32.0))

for index in range(steps):
    t = index * model.opt.timestep
    phase = (2.0 * math.pi * (t * 1000.0)) / cycle_ms
    if model.nu >= 4:
        data.ctrl[0] = math.sin(phase) * amp
        data.ctrl[1] = -math.sin(phase) * amp
        data.ctrl[2] = math.sin(phase + math.pi / 2.0) * roll_amp
        data.ctrl[3] = -math.sin(phase + math.pi / 2.0) * roll_amp
    mujoco.mj_step(model, data)

root_x = float(data.qpos[0]) if model.nq >= 1 else 0.0
root_y = float(data.qpos[1]) if model.nq >= 2 else 0.0
root_z = float(data.qpos[2]) if model.nq >= 3 else 0.0
speed = root_x / max(0.001, duration_ms / 1000.0)
fallen = root_z < 0.025 or abs(root_y) > 0.35

print(json.dumps({
    "engine": "mujoco",
    "backend": "python-mujoco",
    "loaded": True,
    "mujocoVersion": mujoco.__version__,
    "modelName": payload.get("modelName") or "rebuilt_otto",
    "stepCount": steps,
    "durationMs": duration_ms,
    "forwardProgress": root_x,
    "lateralDrift": root_y,
    "finalRootZ": root_z,
    "speedMps": speed,
    "fallen": fallen,
    "nq": int(model.nq),
    "nv": int(model.nv),
    "nu": int(model.nu),
}))
`;

  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', script], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('MuJoCo 仿真超时'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`MuJoCo 仿真失败：${stderr.trim() || `python exited ${code}`}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`MuJoCo 输出不可解析：${stdout.slice(0, 200)} ${error.message}`.trim()));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export class SimulationManager {
  constructor(store) {
    this.store = store;
    this.profile = buildInitialProfile();
    this.currentParams = normalizeParams();
  }

  listProfiles() {
    return [
      {
        id: this.profile.id,
        label: this.profile.label,
        description: this.profile.description,
        cadSources: this.profile.cadSources,
        modelStatus: this.profile.modelStatus
      }
    ];
  }

  async importCad(profileId = 'otto') {
    this.ensureProfile(profileId);
    const stats = await fs.stat(this.profile.cadSources[0]);
    this.profile = {
      ...this.profile,
      modelStatus: 'imported',
      geometry: {
        ...this.profile.geometry,
        primaryCad: this.profile.cadSources[0],
        fileSizeBytes: stats.size,
        importedAt: nowIso(),
        summary: '已识别现在机器人模型/otto_odk.STEP；第一版提取文件级几何摘要，物理参数由手动校准补足。'
      }
    };
    this.store.updateSimulation({
      modelStatus: 'imported',
      profileId: 'otto',
      profiles: {
        otto: this.profile
      }
    });
    this.store.addLog?.('success', '重建 OTTO CAD 档案已导入到本地仿真模型');
    return structuredClone(this.profile);
  }

  async connect({ profileId = 'otto' } = {}) {
    this.ensureProfile(profileId);
    if (this.profile.modelStatus !== 'imported') {
      await this.importCad(profileId);
    }
    const metrics = this.calculateMetrics({
      params: this.currentParams,
      durationMs: 3000
    });
    this.applyMetrics(metrics);
    this.store.updateSimulation({
      connected: true,
      profileId,
      modelStatus: this.profile.modelStatus,
      metrics,
      currentParams: this.currentParams,
      servoAngles: DEFAULT_SERVO_ANGLES
    });
    this.store.addLog?.('success', 'OTTO 本地仿真目标已连接');
    return this.store.snapshot().simulation;
  }

  async disconnect() {
    this.store.updateSimulation({
      connected: false,
      statusMessage: 'OTTO 本地仿真已断开'
    });
    this.store.addLog?.('info', 'OTTO 本地仿真目标已断开');
    return this.store.snapshot().simulation;
  }

  isConnected() {
    return Boolean(this.store.snapshot().simulation?.connected);
  }

  async sendCommand(command = {}) {
    if (!this.isConnected()) {
      throw new Error('OTTO 仿真尚未连接');
    }

    if (command.type === 'servo' && typeof command.id !== 'undefined') {
      const angle = clamp(Number(command.angle ?? 90), 0, 180);
      this.store.updateServo(command.id, angle);
      this.store.updateSimulation({
        servoAngles: {
          ...(this.store.snapshot().simulation?.servoAngles || {}),
          [command.id]: angle
        },
        statusMessage: `仿真舵机 ${command.id} 已转到 ${angle}°`
      });
      return;
    }

    if (command.type === 'move' && String(command.direction || '').startsWith('otto_')) {
      const nextParams = {
        ...this.currentParams,
        hipSwingDeg: command.direction === 'otto_backward' ? 8 : 14,
        torsoLeadDeg: command.direction === 'otto_backward' ? -1 : 2
      };
      this.runTrial(nextParams, 3000);
      return;
    }

    if (command.type === 'gait_trial_start') {
      this.runTrial(command.params || {}, command.durationMs);
      return;
    }

    if (command.type === 'gait_trial_stop' || command.type === 'emergency_stop') {
      this.store.updateSimulation({
        statusMessage: command.type === 'emergency_stop' ? '仿真急停' : '仿真步态已停止'
      });
      this.store.updateGaitTelemetry({
        phase: 'idle',
        lastUpdatedAt: nowIso()
      });
      return;
    }

    if (command.type === 'action') {
      this.store.updateSimulation({
        statusMessage: `仿真执行动作：${command.name || 'unknown'}`
      });
    }
  }

  updatePhysicalParams(partial = {}) {
    this.profile = {
      ...this.profile,
      physicalParams: {
        ...this.profile.physicalParams,
        ...Object.fromEntries(
          Object.entries(partial)
            .filter(([, value]) => value !== '' && value !== null && typeof value !== 'undefined')
            .map(([key, value]) => [key, typeof value === 'number' ? value : Number(value)])
        )
      }
    };
    this.store.updateSimulation({
      profiles: {
        ...(this.store.snapshot().simulation?.profiles || {}),
        otto: this.profile
      }
    });
    return structuredClone(this.profile.physicalParams);
  }

  recordManualCalibration({ distanceMeters, durationMs, fallen = false } = {}) {
    const distance = Number(distanceMeters);
    const duration = Number(durationMs);
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new Error('请输入有效的实测距离');
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('请输入有效的实测用时');
    }

    const snapshot = this.store.snapshot();
    const currentMetrics = snapshot.simulation?.metrics || {};
    const measuredSpeed = distance / (duration / 1000);
    const predictedSpeed = Math.max(0.001, Number(currentMetrics.speedMps || 0.001));
    const sampleScale = clamp(measuredSpeed / predictedSpeed, 0.25, 4);
    const previousSamples = snapshot.simulation?.calibration?.manualSamples || [];
    const manualSamples = [
      ...previousSamples,
      {
        distanceMeters: distance,
        durationMs: duration,
        measuredSpeedMps: round(measuredSpeed),
        predictedSpeedMps: round(predictedSpeed),
        fallen: Boolean(fallen),
        recordedAt: nowIso()
      }
    ].slice(-20);
    const speedScale = round(
      manualSamples.reduce((sum, sample) => sum + sample.measuredSpeedMps / Math.max(0.001, sample.predictedSpeedMps), 0) /
        manualSamples.length,
      3
    );

    const metrics = this.calculateMetrics({
      params: this.currentParams,
      durationMs: duration,
      speedScale,
      fallen
    });
    this.applyMetrics(metrics);
    this.store.updateSimulation({
      metrics,
      calibration: {
        manualSamples,
        speedScale,
        lastManualSampleAt: nowIso()
      }
    });
    return this.store.snapshot().simulation.calibration;
  }

  recommendNextParams() {
    const snapshot = this.store.snapshot();
    const metrics = snapshot.simulation?.metrics || {};
    const speedScale = snapshot.simulation?.calibration?.speedScale || 1;
    const base = this.currentParams;
    const stabilityRoom = Number(metrics.stabilityScore || 0) > 0.62 && !metrics.fallen;
    const params = normalizeParams({
      ...base,
      hipSwingDeg: stabilityRoom ? base.hipSwingDeg + 2 : base.hipSwingDeg - 1,
      kneeLiftDeg: stabilityRoom ? base.kneeLiftDeg + 1 : base.kneeLiftDeg,
      doubleSupportMs: stabilityRoom ? base.doubleSupportMs - 20 : base.doubleSupportMs + 30,
      swingPhaseMs: stabilityRoom ? base.swingPhaseMs - 30 : base.swingPhaseMs + 20,
      torsoLeadDeg: clamp(base.torsoLeadDeg + (stabilityRoom ? 0.5 : -0.5), -8, 12)
    });
    const predicted = this.calculateMetrics({
      params,
      durationMs: 3000,
      speedScale
    });
    const recommendation = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      profileId: 'otto',
      kind: 'gait_params',
      params,
      predicted,
      confidence: predicted.confidence,
      reason: stabilityRoom
        ? '当前稳定裕度允许提高速度：增加摆幅和抬腿，缩短摆腿/双支撑时间。'
        : '当前稳定性不足：先降低速度风险，增加双支撑时间后再继续提速。',
      createdAt: nowIso()
    };
    const recommendations = [recommendation, ...(snapshot.simulation?.recommendations || [])].slice(0, 12);
    this.store.updateSimulation({
      recommendations
    });
    return recommendation;
  }

  exportMuJoCoDraft() {
    if (this.profile.modelStatus !== 'imported') {
      throw new Error('请先导入重建 OTTO CAD，再生成 MuJoCo 草案');
    }

    const xml = buildMuJoCoXml({
      profile: this.profile,
      physicalParams: this.profile.physicalParams
    });
    const draft = {
      engine: 'mujoco',
      status: 'mjcf_draft',
      profileId: 'otto',
      sourceCad: this.profile.geometry.primaryCad,
      xml,
      modelName: 'rebuilt_otto',
      exportedAt: nowIso(),
      todo: [
        '将 STEP 转换为 MuJoCo 可加载的 mesh，并替换当前 box/capsule 近似几何。',
        '用称重和材料密度校准 PLA、舵机、电池、主板质量与惯量。',
        '用俯视标记追踪或实测距离校准脚底摩擦和执行器速度。'
      ]
    };

    this.store.updateSimulation({
      digitalTwin: draft,
      statusMessage: 'MuJoCo MJCF 草案已生成'
    });
    this.store.addLog?.('success', 'MuJoCo 数字孪生 MJCF 草案已生成');
    return draft;
  }

  async runMuJoCoSimulation({ durationMs = 600, params = this.currentParams } = {}) {
    const existingDraft = this.store.snapshot().simulation?.digitalTwin;
    const draft = existingDraft?.xml ? existingDraft : this.exportMuJoCoDraft();
    const normalizedParams = normalizeParams(params, this.currentParams);
    const runtime = await runPythonMuJoCo({
      xml: draft.xml,
      modelName: draft.modelName || 'rebuilt_otto',
      durationMs: clamp(Number(durationMs) || 600, 100, 5000),
      params: normalizedParams
    });
    const result = {
      ...runtime,
      forwardProgress: round(runtime.forwardProgress),
      lateralDrift: round(runtime.lateralDrift),
      finalRootZ: round(runtime.finalRootZ),
      speedMps: round(runtime.speedMps),
      params: normalizedParams,
      ranAt: nowIso()
    };

    this.store.updateSimulation({
      digitalTwin: {
        ...draft,
        runtime: result
      },
      statusMessage: `MuJoCo 动态仿真完成：${result.stepCount} steps`
    });
    this.store.addLog?.('success', 'MuJoCo 动态仿真已完成');
    return result;
  }

  runTrial(params, durationMs = 3000) {
    this.currentParams = normalizeParams(params, this.currentParams);
    const speedScale = this.store.snapshot().simulation?.calibration?.speedScale || 1;
    const metrics = this.calculateMetrics({
      params: this.currentParams,
      durationMs,
      speedScale
    });
    this.applyMetrics(metrics);
    const history = [
      {
        params: this.currentParams,
        metrics,
        durationMs: Number(durationMs || 3000),
        timestamp: nowIso()
      },
      ...(this.store.snapshot().simulation?.history || [])
    ].slice(0, 24);
    this.store.updateSimulation({
      metrics,
      currentParams: this.currentParams,
      history,
      statusMessage: `OTTO 仿真试验完成：${metrics.speedMps} m/s，稳定 ${metrics.stabilityScore}`
    });
  }

  calculateMetrics({ params, durationMs, speedScale, fallen }) {
    return estimateMetrics({
      params: normalizeParams(params, this.currentParams),
      physicalParams: this.profile.physicalParams,
      durationMs,
      speedScale: speedScale || this.store.snapshot().simulation?.calibration?.speedScale || 1,
      fallen
    });
  }

  applyMetrics(metrics) {
    this.store.updateImu(buildImuFromMetrics(metrics));
    this.store.updateGaitTelemetry({
      available: true,
      phase: metrics.phase,
      stepCount: metrics.stepCount,
      forwardProgress: metrics.forwardProgress,
      lateralDrift: metrics.lateralDrift,
      yawDrift: metrics.yawDrift,
      stabilityScore: metrics.stabilityScore,
      fallen: metrics.fallen,
      lastUpdatedAt: metrics.updatedAt
    });
  }

  ensureProfile(profileId) {
    if (profileId !== 'otto') {
      throw new Error('第一版仿真只支持 OTTO profile');
    }
  }
}
