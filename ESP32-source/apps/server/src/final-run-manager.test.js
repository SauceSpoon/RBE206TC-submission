import assert from 'node:assert/strict';
import test from 'node:test';
import { FinalRunManager, FINAL_RUN_TARGET_LABELS } from './final-run-manager.js';
import { StateStore } from './state-store.js';

test('final run manager records task1 start, stop, and resume placeholder state', async () => {
  const store = new StateStore();
  const manager = new FinalRunManager(store);

  assert.deepEqual(FINAL_RUN_TARGET_LABELS, [
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
  ]);

  const started = await manager.start({ task: 'task1' });
  assert.equal(started.status, 'running');
  assert.equal(started.task, 'task1');
  assert.equal(started.targetLabel, '');
  assert.equal(started.lastAction, 'start');

  const stopped = await manager.stop();
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.targetLabel, '');
  assert.equal(stopped.lastAction, 'stop');

  const resumed = await manager.resume();
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.task, 'task1');
  assert.equal(resumed.targetLabel, '');
  assert.equal(resumed.lastAction, 'resume');
  assert.equal(resumed.phaseLabel, 'Task1: 起步向上');
});

test('final run manager rejects invalid task2 targets', async () => {
  const manager = new FinalRunManager(new StateStore());

  await assert.rejects(
    manager.start({ task: 'task2', targetLabel: 'yellow_cylinder' }),
    /未知目标物块/
  );
  await assert.rejects(
    manager.start({ task: 'task2' }),
    /未知目标物块/
  );
});

test('final run start, stop, and resume send real control commands', async () => {
  const store = new StateStore();
  const sent = [];
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  const started = await manager.start({ task: 'task1' });
  assert.equal(started.status, 'running');
  assert.equal(started.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  const stopped = await manager.stop();
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(sent.at(-1), { type: 'emergency_stop' });

  const resumed = await manager.resume();
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
});

test('task2 start and target search move forward synchronously until the target appears', async () => {
  const store = new StateStore();
  const sent = [];
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  const started = await manager.start({ task: 'task2', targetLabel: 'red_cube' });
  assert.equal(started.phase, 'task2_target_search');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  let state = await manager.applyVision({ detections: [] });
  assert.equal(state.phase, 'task2_target_search');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
  assert.equal(sent.length, 1);

  state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.95, cx: 160, frameWidth: 320, area: 1200 }]
  });
  assert.equal(state.phase, 'task2_target_search');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
  assert.equal(sent.length, 1);
});

test('final run start does not enter running state when the control command fails', async () => {
  const store = new StateStore();
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand() {
        throw new Error('机器人尚未连接');
      }
    }
  });

  await assert.rejects(
    manager.start({ task: 'task1' }),
    /机器人尚未连接/
  );
  assert.equal(store.snapshot().finalRun.status, 'idle');
  assert.equal(store.snapshot().finalRun.phase, 'idle');
});

test('task1 uses the center ultrasonic sensor to run the fixed first-pole bypass', async () => {
  const store = new StateStore();
  const sent = [];
  let nowMs = 1_000;
  const manager = new FinalRunManager(store, {
    now: () => nowMs,
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  await manager.start({ task: 'task1' });

  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      centerValid: true,
      centerCm: 17
    }
  });
  let state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.91, cx: 150, cy: 190, frameWidth: 320, frameHeight: 240, area: 1200 }]
  });
  assert.equal(state.phase, 'task1_first_bypass_turn_right');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_right', speed: 40 });

  nowMs += 750;
  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      centerValid: true,
      centerCm: 40
    }
  });
  state = await manager.applyVision({ detections: [] });
  assert.equal(state.phase, 'task1_first_bypass_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  nowMs += 1050;
  state = await manager.applyVision({ detections: [] });
  assert.equal(state.phase, 'task1_first_bypass_turn_left');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_left', speed: 40 });

  nowMs += 750;
  state = await manager.applyVision({ detections: [] });
  assert.equal(state.phase, 'task1_gate_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
});

test('task1 drives through the second-row gate and only uses the camera for the black pole', async () => {
  const store = new StateStore();
  const sent = [];
  let nowMs = 1_000;
  const manager = new FinalRunManager(store, {
    now: () => nowMs,
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  await manager.start({ task: 'task1' });
  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      centerValid: true,
      centerCm: 17
    }
  });
  await manager.applyVision({ detections: [] });
  nowMs += 2600;
  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      centerValid: true,
      centerCm: 40
    }
  });

  let state = await manager.applyVision({
    detections: [
      { label: 'yellow_column', confidence: 0.91, cx: 72, cy: 125, frameWidth: 320, frameHeight: 240, area: 1500 },
      { label: 'yellow_column', confidence: 0.90, cx: 250, cy: 125, frameWidth: 320, frameHeight: 240, area: 800 }
    ]
  });
  assert.equal(state.phase, 'task1_gate_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  state = await manager.applyVision({
    detections: [{ label: 'black_column', confidence: 0.88, cx: 158, frameWidth: 320, area: 700 }]
  });
  assert.equal(state.phase, 'task1_approach_black_column');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  state = await manager.applyVision({
    detections: [{ label: 'black_column', confidence: 0.93, cx: 161, frameWidth: 320, area: 2800 }],
    touched: true
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.phase, 'task1_completed');
  assert.equal(state.phaseLabel, 'Task1: 已触碰黑柱');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_stop', speed: 0 });
  assert.equal(sent.some((command) => command.direction === 'otto_async_forward'), false);
});

test('task1 ignores yellow-column camera detections before the ultrasonic first-pole trigger', async () => {
  const store = new StateStore();
  const sent = [];
  let nowMs = 1_000;
  const manager = new FinalRunManager(store, {
    now: () => nowMs,
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });
  const yellowLeft = {
    label: 'yellow_column',
    confidence: 0.91,
    cx: 80,
    cy: 190,
    frameWidth: 320,
    frameHeight: 240,
    area: 1300
  };

  await manager.start({ task: 'task1' });

  let state = await manager.applyVision({ detections: [yellowLeft] });
  assert.equal(state.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  nowMs += 250;
  state = await manager.applyVision({ detections: [yellowLeft] });
  assert.equal(state.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  nowMs += 300;
  state = await manager.applyVision({ detections: [] });
  assert.equal(state.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
});

test('task1 ignores removed left and right ultrasonic readings', async () => {
  const store = new StateStore();
  const sent = [];
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  await manager.start({ task: 'task1' });
  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      leftValid: true,
      rightValid: true,
      leftCm: 17,
      rightCm: 17,
      centerValid: false,
      centerCm: null
    }
  });

  let state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.91, cx: 80, cy: 190, frameWidth: 320, frameHeight: 240, area: 1300 }]
  });
  assert.equal(state.phase, 'task1_start_forward');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });
});

test('task1 center ultrasonic triggers the fixed first-pole right bypass at 17cm', async () => {
  const store = new StateStore();
  const sent = [];
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  await manager.start({ task: 'task1' });
  store.applyRobotStatus({
    ultrasonic: {
      configured: true,
      centerValid: true,
      centerCm: 17
    }
  });

  const state = await manager.applyVision({
    detections: [{ label: 'yellow_column', confidence: 0.91, cx: 80, cy: 190, frameWidth: 320, frameHeight: 240, area: 1300 }]
  });

  assert.equal(state.phase, 'task1_first_bypass_turn_right');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_right', speed: 40 });
});

test('task2 simulated vision ignores wrong targets and touches the selected object after confirmation', async () => {
  const store = new StateStore();
  const sent = [];
  const manager = new FinalRunManager(store, {
    controlTarget: {
      async sendCommand(command) {
        sent.push(command);
      }
    }
  });

  await manager.start({ task: 'task2', targetLabel: 'red_pyramid' });

  let state = await manager.applyVision({
    detections: [{ label: 'red_cube', confidence: 0.96, cx: 160, frameWidth: 320, area: 1800 }]
  });
  assert.equal(state.phase, 'task2_target_search');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_forward', speed: 40 });

  await manager.applyVision({
    detections: [{ label: 'red_pyramid', confidence: 0.91, cx: 120, frameWidth: 320, area: 900 }]
  });
  assert.equal(store.snapshot().finalRun.phase, 'task2_align_target');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_left', speed: 40 });

  await manager.applyVision({
    detections: [{ label: 'red_pyramid', confidence: 0.92, cx: 160, frameWidth: 320, area: 950 }]
  });
  state = await manager.applyVision({
    detections: [{ label: 'red_pyramid', confidence: 0.93, cx: 158, frameWidth: 320, area: 2600 }],
    touched: true
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.phase, 'completed');
  assert.deepEqual(sent.at(-1), { type: 'move', direction: 'otto_stop', speed: 0 });
});
