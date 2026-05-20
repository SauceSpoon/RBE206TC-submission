const EXTERNAL_BRAIN_SCENES = new Set([
  'first_yellow_ahead',
  'center_gate_visible',
  'black_goal_visible',
  'uncertain'
]);

const EXTERNAL_BRAIN_ACTIONS = new Set([
  'forward',
  'turn_left',
  'turn_right',
  'stop',
  'none'
]);

function normalizeExternalBrain(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const scene = String(payload.scene || 'uncertain').trim();
  const suggestedAction = String(payload.suggestedAction || 'none').trim();
  return {
    model: String(payload.model || '').trim(),
    scene: EXTERNAL_BRAIN_SCENES.has(scene) ? scene : 'uncertain',
    confidence: typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
      ? Math.max(0, Math.min(1, payload.confidence))
      : 0,
    suggestedAction: EXTERNAL_BRAIN_ACTIONS.has(suggestedAction) ? suggestedAction : 'none',
    reason: String(payload.reason || '').slice(0, 240),
    latencyMs: typeof payload.latencyMs === 'number' && Number.isFinite(payload.latencyMs)
      ? Math.max(0, Math.round(payload.latencyMs))
      : null,
    updatedAt: String(payload.updatedAt || new Date().toISOString())
  };
}

function emptyExternalBrain() {
  return {
    model: '',
    scene: 'uncertain',
    confidence: 0,
    suggestedAction: 'none',
    reason: '',
    latencyMs: null,
    updatedAt: null
  };
}

export class PcBrainManager {
  constructor(store, options = {}) {
    this.store = store;
    this.finalRunManager = options.finalRunManager || null;
  }

  snapshot() {
    return this.store.snapshot().pcBrain;
  }

  isRunning() {
    return this.snapshot().status === 'running';
  }

  canAcceptManualCommand(command = {}) {
    if (!this.isRunning()) {
      return true;
    }

    return command.type === 'emergency_stop' || command.type === 'status_request';
  }

  async start({ task = 'task1', targetLabel = '', source = 'opencv' } = {}) {
    const taskMode = String(task || 'task1').trim().toLowerCase();
    const selectedTarget = taskMode === 'task2' ? String(targetLabel || '').trim() : '';

    if (taskMode === 'task2' && !selectedTarget) {
      throw new Error('缺少 PC Brain Task2 目标物块');
    }

    if (!this.finalRunManager?.start) {
      throw new Error('PC Brain 缺少 Final Run 管理器');
    }

    await this.finalRunManager.start({ task: taskMode, targetLabel: selectedTarget });

    const now = new Date().toISOString();
    this.store.updatePcBrain({
      status: 'running',
      task: taskMode,
      source: String(source || 'opencv'),
      targetLabel: selectedTarget,
      startedAt: now,
      stoppedAt: null,
      updatedAt: now,
      lastVisionAt: null,
      lastFrameId: null,
      lastDetectionCount: 0,
      frameCount: 0,
      ignoredVisionCount: 0,
      lastVisionIgnoredReason: '',
      lastStopReason: '',
      externalBrain: emptyExternalBrain()
    });
    this.store.addLog(
      'success',
      taskMode === 'task2' ? `PC Brain Task2 已启动，目标物块：${selectedTarget}` : 'PC Brain Task1 已启动'
    );

    return this.snapshot();
  }

  async stop({ reason = 'operator_stop' } = {}) {
    if (this.finalRunManager?.stop && this.isRunning()) {
      await this.finalRunManager.stop();
    }

    const now = new Date().toISOString();
    this.store.updatePcBrain({
      status: 'stopped',
      stoppedAt: now,
      updatedAt: now,
      lastStopReason: reason
    });
    this.store.addLog('warn', `PC Brain 已停止：${reason}`);

    return this.snapshot();
  }

  async applyVision(event = {}) {
    const current = this.snapshot();
    const detections = Array.isArray(event.detections)
      ? event.detections
      : event.detection
        ? [event.detection]
        : [];
    const externalBrain = normalizeExternalBrain(event.externalBrain);

    if (current.status !== 'running') {
      const now = new Date().toISOString();
      this.store.updatePcBrain({
        updatedAt: now,
        lastVisionAt: now,
        lastFrameId: typeof event.frameId === 'number' ? event.frameId : current.lastFrameId,
        lastDetectionCount: detections.length,
        frameCount: current.frameCount + 1,
        ignoredVisionCount: current.ignoredVisionCount + 1,
        lastVisionIgnoredReason: 'pc_brain_not_running',
        ...(externalBrain ? { externalBrain } : {})
      });
      return this.snapshot();
    }

    if (!this.finalRunManager?.applyVision) {
      throw new Error('PC Brain 缺少视觉任务处理器');
    }

    const now = new Date().toISOString();

    this.store.updatePcBrain({
      updatedAt: now,
      lastVisionAt: now,
      lastFrameId: typeof event.frameId === 'number' ? event.frameId : current.lastFrameId,
      lastDetectionCount: detections.length,
      frameCount: current.frameCount + 1,
      lastVisionIgnoredReason: '',
      ...(externalBrain ? { externalBrain } : {})
    });

    await this.finalRunManager.applyVision({
      ...Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'externalBrain')),
      detections
    });

    return this.snapshot();
  }
}
