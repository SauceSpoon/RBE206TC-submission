import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { SimulationManager } from './sim-robot-manager.js';

const mujocoAvailable = spawnSync('python3', ['-c', 'import mujoco'], {
  stdio: 'ignore'
}).status === 0;

class FakeStore extends EventEmitter {
  constructor() {
    super();
    this.state = {
      simulation: {
        connected: false,
        profileId: '',
        modelStatus: 'not_imported',
        profiles: {},
        metrics: {},
        calibration: {
          manualSamples: [],
          speedScale: 1
        },
        tracking: {},
        recommendations: [],
        digitalTwin: {
          runtime: {}
        }
      },
      imu: {},
      gait: {
        telemetry: {}
      },
      servoAngles: {
        1: 90,
        2: 90,
        8: 90,
        9: 90
      }
    };
    this.logs = [];
  }

  snapshot() {
    return structuredClone(this.state);
  }

  updateSimulation(partial) {
    this.state.simulation = {
      ...this.state.simulation,
      ...partial,
      calibration: {
        ...this.state.simulation.calibration,
        ...(partial.calibration || {})
      },
      tracking: {
        ...this.state.simulation.tracking,
        ...(partial.tracking || {})
      }
    };
  }

  updateImu(partial) {
    this.state.imu = {
      ...this.state.imu,
      ...partial
    };
  }

  updateGaitTelemetry(partial) {
    this.state.gait.telemetry = {
      ...this.state.gait.telemetry,
      ...partial
    };
  }

  updateServo(id, angle) {
    this.state.servoAngles = {
      ...this.state.servoAngles,
      [id]: angle
    };
  }

  addLog(level, message) {
    this.logs.push({ level, message });
  }
}

test('lists only the OTTO simulation profile for v1', () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);

  const profiles = manager.listProfiles();

  assert.deepEqual(
    profiles.map((profile) => profile.id),
    ['otto']
  );
  assert.equal(profiles[0].cadSources.some((source) => source.includes('ODK2')), false);
  assert.equal(profiles[0].cadSources.some((source) => source.includes('新步态算法')), false);
  assert.equal(profiles[0].cadSources.some((source) => source.includes('现在机器人模型')), true);
});

test('imports the OTTO CAD profile without mixing the ODK2 model', async () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);

  const profile = await manager.importCad('otto');

  assert.equal(profile.id, 'otto');
  assert.equal(profile.modelStatus, 'imported');
  assert.equal(profile.geometry.primaryCad.includes('现在机器人模型/otto_odk.STEP'), true);
  assert.equal(profile.geometry.primaryCad.includes('odk2'), false);
  assert.equal(profile.geometry.primaryCad.includes('新步态算法'), false);
  assert.ok(profile.geometry.fileSizeBytes > 1000);
  assert.ok(profile.physicalParams.totalMassKg > 0);
  assert.equal(store.state.simulation.modelStatus, 'imported');
});

test('simulation control updates local telemetry without a real robot connection', async () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);
  await manager.importCad('otto');
  await manager.connect({ profileId: 'otto' });

  await manager.sendCommand({ type: 'servo', id: 1, angle: 104 });
  await manager.sendCommand({
    type: 'gait_trial_start',
    params: {
      hipSwingDeg: 18,
      kneeLiftDeg: 22,
      doubleSupportMs: 160,
      swingPhaseMs: 320,
      torsoLeadDeg: 2
    },
    durationMs: 3000
  });

  assert.equal(store.state.servoAngles[1], 104);
  assert.equal(store.state.simulation.connected, true);
  assert.equal(store.state.simulation.metrics.phase, 'simulated_otto_walk');
  assert.ok(store.state.simulation.metrics.speedMps > 0);
  assert.ok(store.state.gait.telemetry.forwardProgress > 0);
  assert.equal(store.state.imu.available, true);
});

test('manual calibration rescales speed and AI recommendation prefers faster stable gait params', async () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);
  await manager.importCad('otto');
  await manager.connect({ profileId: 'otto' });

  await manager.sendCommand({
    type: 'gait_trial_start',
    params: {
      hipSwingDeg: 12,
      kneeLiftDeg: 16,
      doubleSupportMs: 220,
      swingPhaseMs: 420,
      torsoLeadDeg: 1
    },
    durationMs: 4000
  });
  const beforeCalibration = store.state.simulation.metrics.speedMps;

  const calibration = manager.recordManualCalibration({
    distanceMeters: 0.32,
    durationMs: 4000,
    fallen: false
  });
  const recommendation = manager.recommendNextParams();

  assert.ok(calibration.speedScale > 1);
  assert.ok(store.state.simulation.metrics.speedMps > beforeCalibration);
  assert.equal(recommendation.profileId, 'otto');
  assert.equal(recommendation.kind, 'gait_params');
  assert.ok(recommendation.params.hipSwingDeg >= 12);
  assert.ok(recommendation.params.swingPhaseMs <= 420);
  assert.match(recommendation.reason, /速度|稳定/);
});

test('exports a MuJoCo draft from the rebuilt OTTO profile', async () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);
  await manager.importCad('otto');

  const draft = manager.exportMuJoCoDraft();

  assert.equal(draft.engine, 'mujoco');
  assert.equal(draft.status, 'mjcf_draft');
  assert.equal(draft.sourceCad.includes('现在机器人模型/otto_odk.STEP'), true);
  assert.equal(draft.sourceCad.includes('新步态算法'), false);
  assert.match(draft.xml, /<mujoco model="rebuilt_otto"/);
  assert.match(draft.xml, /<compiler angle="degree"/);
  assert.match(draft.xml, /<joint name="left_leg_pitch"/);
  assert.match(draft.xml, /<joint name="right_hip_roll"/);
  assert.match(draft.xml, /<motor name="left_leg_servo"/);
  assert.match(draft.xml, /<geom name="left_foot"/);
  assert.equal(draft.todo.some((item) => item.includes('STEP')), true);
  assert.equal(store.state.simulation.digitalTwin.status, 'mjcf_draft');
});

test('runs the MuJoCo draft through the Python MuJoCo engine', {
  skip: mujocoAvailable ? false : 'MuJoCo is optional and not needed for the real robot flow'
}, async () => {
  const store = new FakeStore();
  const manager = new SimulationManager(store);
  await manager.importCad('otto');
  manager.exportMuJoCoDraft();

  const result = await manager.runMuJoCoSimulation({
    durationMs: 300,
    params: {
      hipSwingDeg: 10,
      kneeLiftDeg: 12,
      doubleSupportMs: 180,
      swingPhaseMs: 320,
      torsoLeadDeg: 1
    }
  });

  assert.equal(result.engine, 'mujoco');
  assert.equal(result.backend, 'python-mujoco');
  assert.equal(result.loaded, true);
  assert.ok(result.stepCount > 0);
  assert.equal(Number.isFinite(result.finalRootZ), true);
  assert.equal(Number.isFinite(result.forwardProgress), true);
  assert.equal(result.modelName, 'rebuilt_otto');
  assert.equal(store.state.simulation.digitalTwin.runtime.loaded, true);
  assert.equal(store.state.simulation.digitalTwin.runtime.stepCount, result.stepCount);
});
