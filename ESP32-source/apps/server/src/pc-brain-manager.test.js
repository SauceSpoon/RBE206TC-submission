import assert from 'node:assert/strict';
import test from 'node:test';
import { PcBrainManager } from './pc-brain-manager.js';
import { StateStore } from './state-store.js';

function createFinalRunStub() {
  const calls = [];
  return {
    calls,
    async start(payload) {
      calls.push({ method: 'start', payload });
      return { status: 'running', task: payload.task, targetLabel: payload.targetLabel || '' };
    },
    async stop() {
      calls.push({ method: 'stop' });
      return { status: 'stopped' };
    },
    async applyVision(payload) {
      calls.push({ method: 'applyVision', payload });
      return { status: 'running', phase: 'task1_approach_black_column' };
    }
  };
}

test('pc brain starts task1 obstacle avoidance without a target by default', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  const started = await manager.start({ source: 'opencv' });

  assert.equal(started.status, 'running');
  assert.equal(started.task, 'task1');
  assert.equal(started.targetLabel, '');
  assert.equal(started.source, 'opencv');
  assert.equal(store.snapshot().pcBrain.status, 'running');
  assert.deepEqual(finalRun.calls, [
    { method: 'start', payload: { task: 'task1', targetLabel: '' } }
  ]);
});

test('pc brain starts task2 only with a selected target', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  await assert.rejects(
    manager.start({ task: 'task2' }),
    /缺少 PC Brain Task2 目标物块/
  );

  const started = await manager.start({ task: 'task2', targetLabel: 'red_cube', source: 'opencv' });
  assert.equal(started.status, 'running');
  assert.equal(started.task, 'task2');
  assert.equal(started.targetLabel, 'red_cube');
  assert.deepEqual(finalRun.calls.at(-1), {
    method: 'start',
    payload: { task: 'task2', targetLabel: 'red_cube' }
  });
});

test('pc brain ignores vision events while stopped', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  const state = await manager.applyVision({
    detections: [{ label: 'black_column', confidence: 0.91, cx: 150, frameWidth: 320 }]
  });

  assert.equal(state.status, 'idle');
  assert.equal(state.ignoredVisionCount, 1);
  assert.equal(state.lastVisionIgnoredReason, 'pc_brain_not_running');
  assert.deepEqual(finalRun.calls, []);
});

test('pc brain stores external brain sidecar analysis while stopped without driving final run', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });
  const externalBrain = {
    model: 'qwen3-vl:4b',
    scene: 'center_gate_visible',
    confidence: 0.71,
    suggestedAction: 'forward',
    reason: '中间通道可见',
    latencyMs: 810,
    updatedAt: '2026-05-17T08:30:00.000Z'
  };

  const state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.86, cx: 144, frameWidth: 320 }],
    frameId: 22,
    externalBrain
  });

  assert.equal(state.status, 'idle');
  assert.equal(state.ignoredVisionCount, 1);
  assert.equal(state.lastFrameId, 22);
  assert.equal(state.lastDetectionCount, 1);
  assert.deepEqual(state.externalBrain, externalBrain);
  assert.deepEqual(finalRun.calls, []);
});

test('pc brain forwards vision to final run only while running', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  await manager.start({ task: 'task1' });
  const state = await manager.applyVision({
    detections: [{ label: 'black_column', confidence: 0.88, cx: 160, frameWidth: 320, area: 900 }],
    frameId: 7
  });

  assert.equal(state.status, 'running');
  assert.equal(state.frameCount, 1);
  assert.equal(state.lastFrameId, 7);
  assert.equal(state.lastDetectionCount, 1);
  assert.equal(finalRun.calls.at(-1).method, 'applyVision');
  assert.deepEqual(finalRun.calls.at(-1).payload.detections, [
    { label: 'black_column', confidence: 0.88, cx: 160, frameWidth: 320, area: 900 }
  ]);
});

test('pc brain stores external brain sidecar analysis without changing final run vision payload', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });
  const externalBrain = {
    model: 'qwen3-vl:4b',
    scene: 'first_yellow_ahead',
    confidence: 0.82,
    suggestedAction: 'turn_right',
    reason: '第一个黄色柱子位于正前方',
    latencyMs: 740,
    updatedAt: '2026-05-17T08:00:00.000Z'
  };

  await manager.start({ task: 'task1' });
  const state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.9, cx: 160, frameWidth: 320, area: 1800 }],
    frameId: 11,
    externalBrain
  });

  assert.deepEqual(state.externalBrain, externalBrain);
  assert.equal(finalRun.calls.at(-1).method, 'applyVision');
  assert.equal(finalRun.calls.at(-1).payload.externalBrain, undefined);
});

test('pc brain stop delegates final run stop and returns to idle', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  await manager.start({ task: 'task1' });
  const stopped = await manager.stop({ reason: 'operator_stop' });

  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.lastStopReason, 'operator_stop');
  assert.equal(store.snapshot().pcBrain.status, 'stopped');
  assert.equal(finalRun.calls.at(-1).method, 'stop');
});

test('pc brain blocks ordinary manual commands only while running but always allows emergency stop', async () => {
  const store = new StateStore();
  const finalRun = createFinalRunStub();
  const manager = new PcBrainManager(store, { finalRunManager: finalRun });

  assert.equal(manager.canAcceptManualCommand({ type: 'move', direction: 'otto_forward' }), true);

  await manager.start({ task: 'task1' });

  assert.equal(manager.canAcceptManualCommand({ type: 'move', direction: 'otto_forward' }), false);
  assert.equal(manager.canAcceptManualCommand({ type: 'servo', id: 1, angle: 90 }), false);
  assert.equal(manager.canAcceptManualCommand({ type: 'emergency_stop' }), true);
  assert.equal(manager.canAcceptManualCommand({ type: 'status_request' }), true);
});
