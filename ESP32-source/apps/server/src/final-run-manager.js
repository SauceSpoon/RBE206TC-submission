import { ottoStableMoveCommand } from '../../shared/otto-controls.js';

export const FINAL_RUN_TARGET_LABELS = [
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

const TARGET_LABEL_SET = new Set(FINAL_RUN_TARGET_LABELS);
const CENTER_TOLERANCE_RATIO = 0.12;
const MIN_COLUMN_CONFIDENCE = 0.60;
const MIN_TARGET_CONFIDENCE = 0.75;
const TASK1_TOUCH_AREA = 2400;
const TASK2_TOUCH_AREA = 2400;
const TASK2_CONFIRM_FRAMES = 2;
const TASK1_ULTRASONIC_WARNING_CM = 17;
const TASK1_FIRST_BYPASS_TURN_MS = 700;
const TASK1_FIRST_BYPASS_FORWARD_MS = 1000;
const TASK1_FIRST_BYPASS_RECOVER_MS = 700;
const TASK_MODES = new Set(['task1', 'task2']);

const COMMANDS = {
  search: ottoStableMoveCommand('otto_left'),
  stopMove: ottoStableMoveCommand('otto_stop'),
  emergencyStop: { type: 'emergency_stop' },
  forward: ottoStableMoveCommand('otto_forward'),
  turnLeft: ottoStableMoveCommand('otto_left'),
  turnRight: ottoStableMoveCommand('otto_right'),
  avoidRight: ottoStableMoveCommand('otto_right'),
  avoidLeft: ottoStableMoveCommand('otto_left')
};

function assertTargetLabel(targetLabel) {
  if (!TARGET_LABEL_SET.has(targetLabel)) {
    throw new Error(`未知目标物块：${targetLabel || '未选择'}`);
  }
}

function normalizeTask(task) {
  const normalized = String(task || 'task1').trim().toLowerCase();
  if (!TASK_MODES.has(normalized)) {
    throw new Error(`未知任务：${task || '未选择'}`);
  }
  return normalized;
}

function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function detectionLabel(detection = {}) {
  const label = normalizeLabel(detection.label);
  if (label) {
    return label;
  }

  const color = normalizeLabel(detection.color);
  const shape = normalizeLabel(detection.shape);
  return color && shape ? `${color}_${shape}` : color;
}

function detectionConfidence(detection = {}) {
  return typeof detection.confidence === 'number' ? detection.confidence : 0;
}

function detectionArea(detection = {}) {
  return typeof detection.area === 'number' ? detection.area : 0;
}

function detectionCx(detection = {}) {
  const frameWidth = typeof detection.frameWidth === 'number' && detection.frameWidth > 0 ? detection.frameWidth : 320;
  return typeof detection.cx === 'number' ? detection.cx : frameWidth / 2;
}

function isBlackColumn(detection = {}) {
  const label = detectionLabel(detection);
  const color = normalizeLabel(detection.color);
  return label === 'black_column' || label === 'black_cylinder' || label === 'black' || color === 'black';
}

function bestDetection(detections = [], predicate, minConfidence) {
  return detections
    .filter((detection) => predicate(detection) && detectionConfidence(detection) >= minConfidence)
    .sort((left, right) => detectionConfidence(right) - detectionConfidence(left))[0] || null;
}

function centerError(detection = {}) {
  const frameWidth = typeof detection.frameWidth === 'number' && detection.frameWidth > 0 ? detection.frameWidth : 320;
  const cx = typeof detection.cx === 'number' ? detection.cx : frameWidth / 2;
  return {
    error: cx - frameWidth / 2,
    tolerance: Math.max(14, frameWidth * CENTER_TOLERANCE_RATIO)
  };
}

function commandForAlignment(detection) {
  const { error, tolerance } = centerError(detection);
  if (error < -tolerance) {
    return COMMANDS.turnLeft;
  }

  if (error > tolerance) {
    return COMMANDS.turnRight;
  }

  return COMMANDS.forward;
}

function commandKey(command = {}) {
  return JSON.stringify(command);
}

function task1CenterObstacleDetected(ultrasonic = {}) {
  return ultrasonic.centerValid === true &&
    typeof ultrasonic.centerCm === 'number' &&
    ultrasonic.centerCm > 0 &&
    ultrasonic.centerCm <= TASK1_ULTRASONIC_WARNING_CM;
}

function task1PhaseStartMs(current = {}, fallbackMs) {
  const phaseStartedAt = Date.parse(current.phaseStartedAt || '');
  if (Number.isFinite(phaseStartedAt)) {
    return phaseStartedAt;
  }

  const updatedAt = Date.parse(current.updatedAt || '');
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  return fallbackMs;
}

function advanceTask1TimedPhase(phase, phaseStartedAtMs, nowMs) {
  let nextPhase = phase;
  let nextPhaseStartedAtMs = phaseStartedAtMs;
  let elapsedMs = Math.max(0, nowMs - nextPhaseStartedAtMs);

  while (true) {
    if (nextPhase === 'task1_first_bypass_turn_right' && elapsedMs >= TASK1_FIRST_BYPASS_TURN_MS) {
      nextPhase = 'task1_first_bypass_forward';
      nextPhaseStartedAtMs += TASK1_FIRST_BYPASS_TURN_MS;
      elapsedMs = nowMs - nextPhaseStartedAtMs;
      continue;
    }

    if (nextPhase === 'task1_first_bypass_forward' && elapsedMs >= TASK1_FIRST_BYPASS_FORWARD_MS) {
      nextPhase = 'task1_first_bypass_turn_left';
      nextPhaseStartedAtMs += TASK1_FIRST_BYPASS_FORWARD_MS;
      elapsedMs = nowMs - nextPhaseStartedAtMs;
      continue;
    }

    if (nextPhase === 'task1_first_bypass_turn_left' && elapsedMs >= TASK1_FIRST_BYPASS_RECOVER_MS) {
      nextPhase = 'task1_gate_forward';
      nextPhaseStartedAtMs += TASK1_FIRST_BYPASS_RECOVER_MS;
      elapsedMs = nowMs - nextPhaseStartedAtMs;
      continue;
    }

    return {
      phase: nextPhase,
      phaseStartedAtMs: nextPhaseStartedAtMs
    };
  }
}

function task1RouteCommandForPhase(phase) {
  if (phase === 'task1_first_bypass_turn_right') {
    return COMMANDS.turnRight;
  }

  if (phase === 'task1_first_bypass_forward') {
    return COMMANDS.forward;
  }

  if (phase === 'task1_first_bypass_turn_left') {
    return COMMANDS.turnLeft;
  }

  return COMMANDS.forward;
}

function shouldSendCommand(command, current = {}) {
  if (command.type === 'emergency_stop') {
    return true;
  }

  if (command.type === 'move' && command.direction === 'otto_stop') {
    return true;
  }

  return commandKey(command) !== commandKey(current.lastCommand || {});
}

function phaseLabelFor(phase, targetLabel = '') {
  if (phase === 'task1_route_start') {
    return 'Task1: 起步向上';
  }

  if (phase === 'task1_start_forward') {
    return 'Task1: 起步向上';
  }

  if (phase === 'task1_first_bypass_turn_right') {
    return 'Task1: 右绕第一个黄柱';
  }

  if (phase === 'task1_first_bypass_forward') {
    return 'Task1: 绕过第一个黄柱';
  }

  if (phase === 'task1_first_bypass_turn_left') {
    return 'Task1: 回正进入中线';
  }

  if (phase === 'task1_gate_forward') {
    return 'Task1: 穿过第二排中间';
  }

  if (phase === 'task1_search_black_column') {
    return 'Task1: 搜索黑柱';
  }

  if (phase === 'task1_approach_black_column') {
    return 'Task1: 接近黑柱';
  }

  if (phase === 'task1_completed') {
    return 'Task1: 已触碰黑柱';
  }

  if (phase === 'task2_target_search') {
    return `Task2: 搜索 ${targetLabel}`;
  }

  if (phase === 'task2_align_target') {
    return `Task2: 对准 ${targetLabel}`;
  }

  if (phase === 'task2_touch_target') {
    return `Task2: 轻触 ${targetLabel}`;
  }

  if (phase === 'completed') {
    return '任务已完成';
  }

  return '等待启动';
}

export class FinalRunManager {
  constructor(store, options = {}) {
    this.store = store;
    this.controlTarget = options.controlTarget || null;
    this.now = options.now || (() => Date.now());
    this.task2ConfirmCount = 0;
  }

  async sendCommand(command) {
    if (!this.controlTarget?.sendCommand) {
      return;
    }

    await this.controlTarget.sendCommand(command, {
      waitForReconnect: true,
      reconnectTimeoutMs: 60000
    });
  }

  async start({ task = 'task1', targetLabel = '' } = {}) {
    const taskMode = normalizeTask(task);
    const selectedTarget = taskMode === 'task2' ? targetLabel : '';
    if (taskMode === 'task2') {
      assertTargetLabel(selectedTarget);
    }

    const now = new Date(this.now()).toISOString();
    const phase = taskMode === 'task2' ? 'task2_target_search' : 'task1_start_forward';
    const initialCommand = COMMANDS.forward;
    const data = {
      task: taskMode,
      targetLabel: selectedTarget,
      status: 'running',
      phase,
      phaseLabel: phaseLabelFor(phase, selectedTarget),
      lastAction: 'start',
      startedAt: now,
      stoppedAt: null,
      resumedAt: null,
      updatedAt: now,
      lastVisionAt: null,
      phaseStartedAt: now,
      lastCommand: initialCommand
    };

    this.task2ConfirmCount = 0;
    await this.sendCommand(initialCommand);
    this.store.updateFinalRun(data);
    this.store.addLog(
      'success',
      taskMode === 'task2' ? `Task2 已启动，目标物块：${selectedTarget}` : 'Task1 自动路线已启动：右绕首个黄柱并穿过第二排中间'
    );
    return this.store.snapshot().finalRun;
  }

  async stop() {
    const now = new Date(this.now()).toISOString();
    const snapshot = this.store.snapshot();
    const current = snapshot.finalRun;
    const data = {
      status: 'stopped',
      phase: current.phase || 'paused',
      phaseLabel: '已停止，等待继续',
      lastAction: 'stop',
      stoppedAt: now,
      updatedAt: now,
      lastCommand: COMMANDS.emergencyStop
    };

    this.store.updateFinalRun(data);
    this.store.addLog('warn', 'Final go 已停止');
    await this.sendCommand(COMMANDS.emergencyStop);
    return this.store.snapshot().finalRun;
  }

  async resume() {
    const now = new Date(this.now()).toISOString();
    const current = this.store.snapshot().finalRun;
    const phase = current.phase === 'idle' || current.phase === 'completed'
      ? current.task === 'task2'
        ? 'task2_target_search'
        : 'task1_start_forward'
      : current.phase;
    const data = {
      status: 'running',
      phase,
      phaseLabel: phaseLabelFor(phase, current.targetLabel),
      lastAction: 'resume',
      resumedAt: now,
      updatedAt: now,
      phaseStartedAt: now,
      lastCommand: COMMANDS.forward
    };

    await this.sendCommand(data.lastCommand);
    this.store.updateFinalRun(data);
    this.store.addLog('success', 'Final go 已继续');
    return this.store.snapshot().finalRun;
  }

  async applyVision(event = {}) {
    const snapshot = this.store.snapshot();
    const current = snapshot.finalRun;
    if (current.status !== 'running') {
      return current;
    }

    const detections = Array.isArray(event.detections)
      ? event.detections
      : event.detection
        ? [event.detection]
        : [];
    const targetLabel = current.targetLabel || '';
    const taskMode = current.task || (current.phase?.startsWith('task2') ? 'task2' : 'task1');
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();

    let phase = current.phase || 'task1_start_forward';
    if (phase === 'task1_route_start') {
      phase = 'task1_start_forward';
    }
    let phaseStartedAtMs = task1PhaseStartMs(current, nowMs);
    let command = COMMANDS.forward;
    let status = 'running';
    let logMessage = '';

    if (taskMode === 'task1' && phase.startsWith('task1')) {
      const blackColumn = bestDetection(detections, isBlackColumn, MIN_COLUMN_CONFIDENCE);
      if (blackColumn && (event.touched || detectionArea(blackColumn) >= TASK1_TOUCH_AREA)) {
        phase = 'task1_completed';
        status = 'completed';
        command = COMMANDS.stopMove;
        phaseStartedAtMs = nowMs;
        this.task2ConfirmCount = 0;
        logMessage = 'Task1 已完成：已触碰黑柱';
      } else if (blackColumn && (phase === 'task1_gate_forward' || phase === 'task1_approach_black_column')) {
        phase = 'task1_approach_black_column';
        command = commandForAlignment(blackColumn);
        if (current.phase !== phase) {
          phaseStartedAtMs = nowMs;
        }
      } else {
        if (phase === 'task1_start_forward' && task1CenterObstacleDetected(snapshot.ultrasonic)) {
          phase = 'task1_first_bypass_turn_right';
          phaseStartedAtMs = nowMs;
          command = COMMANDS.turnRight;
        } else if (
          phase === 'task1_first_bypass_turn_right' ||
          phase === 'task1_first_bypass_forward' ||
          phase === 'task1_first_bypass_turn_left'
        ) {
          const advanced = advanceTask1TimedPhase(phase, phaseStartedAtMs, nowMs);
          phase = advanced.phase;
          phaseStartedAtMs = advanced.phaseStartedAtMs;
          command = task1RouteCommandForPhase(phase);
        } else if (phase === 'task1_gate_forward') {
          command = COMMANDS.forward;
        } else if (phase === 'task1_approach_black_column') {
          command = COMMANDS.forward;
        } else {
          phase = 'task1_start_forward';
          phaseStartedAtMs = nowMs;
          command = COMMANDS.forward;
        }
      }
    } else if (taskMode === 'task2' && phase.startsWith('task2')) {
      const target = bestDetection(
        detections,
        (detection) => detectionLabel(detection) === targetLabel,
        MIN_TARGET_CONFIDENCE
      );

      if (!target) {
        this.task2ConfirmCount = 0;
        phase = 'task2_target_search';
        command = COMMANDS.forward;
      } else if (event.touched || detectionArea(target) >= TASK2_TOUCH_AREA) {
        phase = 'completed';
        status = 'completed';
        command = COMMANDS.stopMove;
        logMessage = `Task2 已触碰目标：${targetLabel}`;
      } else {
        this.task2ConfirmCount += 1;
        phase = this.task2ConfirmCount >= TASK2_CONFIRM_FRAMES ? 'task2_touch_target' : 'task2_align_target';
        command = commandForAlignment(target);
      }
    }

    this.store.updateFinalRun({
      status,
      phase,
      phaseLabel: phaseLabelFor(phase, targetLabel),
      lastAction: 'vision',
      lastVisionAt: now,
      updatedAt: now,
      phaseStartedAt: new Date(phaseStartedAtMs).toISOString(),
      lastCommand: command
    });

    if (logMessage) {
      this.store.addLog('success', logMessage);
    }

    if (shouldSendCommand(command, current)) {
      await this.sendCommand(command);
    }
    return this.store.snapshot().finalRun;
  }
}
