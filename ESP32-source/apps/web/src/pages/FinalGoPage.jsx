import { useEffect, useMemo, useRef, useState } from 'react';
import { finalRunTargetLabels, formatTime } from '../dashboard-config.jsx';

const CAMERA_FRAME_INTERVAL_MS = 1000;
const KEYBOARD_REPEAT_MS = 100;
const TASK1_ULTRASONIC_STEERING_CM = 22;
const PC_BRAIN_ENDPOINTS = {
  start: '/api/pc-brain/start',
  stop: '/api/pc-brain/stop'
};
const ROBOT_CONTROL_ENDPOINT = '/api/control';
const DEFAULT_FINAL_STATUS_SECTIONS = {
  runStatus: true,
  externalBrain: false,
  ultrasonic: false,
  imu: false
};
const KEYBOARD_TELEOP_COMMANDS = {
  w: { type: 'move', direction: 'otto_forward', speed: 40 },
  s: { type: 'move', direction: 'otto_backward', speed: 40 },
  q: { type: 'move', direction: 'otto_left', speed: 40 },
  e: { type: 'move', direction: 'otto_right', speed: 40 }
};
const KEYBOARD_TELEOP_LABELS = {
  w: 'W 同步直行',
  s: 'S 同步后退',
  q: 'Q 左转',
  e: 'E 右转'
};
const KEYBOARD_STOP_COMMAND = { type: 'move', direction: 'otto_stop', speed: 0 };

const TARGET_COLORS = {
  black: '#15191f',
  blue: '#2d9cdb',
  green: '#27ae60',
  red: '#e94f37'
};

const TARGET_SHAPE_LABELS = {
  cube: '方块',
  ball: '球',
  pyramid: '金字塔'
};

function splitTargetLabel(label) {
  const [color = 'red', shape = 'cube'] = String(label || 'red_cube').split('_');
  return { color, shape };
}

function appendCacheBuster(url, token) {
  if (!url) return '';
  return url.includes('?') ? `${url}&t=${token}` : `${url}?t=${token}`;
}

function TargetIcon({ label }) {
  const { color, shape } = splitTargetLabel(label);
  const background = TARGET_COLORS[color] || '#7f8c8d';

  if (shape === 'ball') {
    return <span className="final-target-icon ball" style={{ background }} />;
  }

  if (shape === 'pyramid') {
    return <span className="final-target-icon pyramid" style={{ borderBottomColor: background }} />;
  }

  return <span className="final-target-icon cube" style={{ background }} />;
}

function formatDegrees(value) {
  return typeof value === 'number' ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}°` : '--';
}

function formatElapsedMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value / 1000).toFixed(1)} s` : '--';
}

function formatConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '--';
}

function formatLatencyMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} ms` : '--';
}

function formatDistanceCm(value, valid) {
  return valid && typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} cm` : '--';
}

function ultrasonicDistanceStatus(value, valid, near, danger) {
  if (!valid) return '无效';
  if (danger) return '危险';
  if (near) return '近';
  if (typeof value === 'number' && value <= TASK1_ULTRASONIC_STEERING_CM) return '预转向';
  return '正常';
}

function yawDirectionLabel(value) {
  if (value === 'right') return '右偏 / -';
  if (value === 'left') return '左偏 / +';
  return '基本直行';
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function CollapsibleInfoSection({ id, title, open, onToggle, children }) {
  return (
    <section className={`final-status-section ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="final-status-section-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="final-status-section-icon" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div id={id} className="final-status-section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function FinalGoPage({
  apiBase,
  dashboard,
  ip,
  setIp,
  cameraForm,
  updateCameraForm,
  busy,
  cameraConnectError = '',
  finalRun,
  pcBrain,
  gaitTelemetry,
  ultrasonic,
  cameraSnapshotProxyUrl = '',
  liveStreamUrl = '',
  handleConnect,
  handleDisconnect,
  handleCameraConnect,
  handleCameraDisconnect,
  onFinalRunUpdate,
  onPcBrainUpdate,
  manualCommand,
  onToast
}) {
  const [targetLabel, setTargetLabel] = useState(finalRun?.targetLabel || 'red_cube');
  const [busyAction, setBusyAction] = useState('');
  const [cameraToken, setCameraToken] = useState(Date.now());
  const [openStatusSections, setOpenStatusSections] = useState(DEFAULT_FINAL_STATUS_SECTIONS);
  const [keyboardTeleopEnabled, setKeyboardTeleopEnabled] = useState(false);
  const [keyboardTeleopKey, setKeyboardTeleopKey] = useState('');
  const keyboardRepeatTimerRef = useRef(null);
  const keyboardActiveKeyRef = useRef('');

  const selectedTarget = useMemo(() => splitTargetLabel(targetLabel), [targetLabel]);
  const shapeLabel = TARGET_SHAPE_LABELS[selectedTarget.shape] || selectedTarget.shape;
  const isTask2 = finalRun?.task === 'task2';
  const taskLabel = isTask2 ? 'Task2' : 'Task1';
  const statusLabel = finalRun?.status === 'running' ? '运行中' : finalRun?.status === 'stopped' ? '已停止' : '等待启动';
  const pcBrainStatusLabel = pcBrain?.status === 'running' ? '电脑大脑运行中' : pcBrain?.status === 'stopped' ? '电脑大脑已停止' : '电脑大脑待命';
  const robotConnected = Boolean(dashboard?.robot?.connected);
  const cameraConnected = Boolean(dashboard?.camera?.connected);
  const ottoDiagnosticAvailable = Boolean(gaitTelemetry?.ottoStraightDiagnosticAvailable);
  const showTask1CameraPreview = !isTask2;
  const externalBrain = pcBrain?.externalBrain || {};
  const finalCameraUrl = showTask1CameraPreview
    ? cameraSnapshotProxyUrl
      ? appendCacheBuster(cameraSnapshotProxyUrl, cameraToken)
      : liveStreamUrl
    : '';

  function clearKeyboardRepeat() {
    if (keyboardRepeatTimerRef.current) {
      window.clearInterval(keyboardRepeatTimerRef.current);
      keyboardRepeatTimerRef.current = null;
    }
  }

  async function submitManualCommand(command, successMessage = '') {
    if (!manualCommand) {
      onToast?.('键盘控制接口未就绪');
      return;
    }

    try {
      await manualCommand(command);
      if (successMessage) {
        onToast?.(successMessage);
      }
    } catch (error) {
      onToast?.(error.message);
    }
  }

  function resetKeyboardMotion(sendStop = false) {
    clearKeyboardRepeat();
    keyboardActiveKeyRef.current = '';
    setKeyboardTeleopKey('');
    if (sendStop) {
      submitManualCommand(KEYBOARD_STOP_COMMAND);
    }
  }

  function toggleKeyboardTeleop() {
    setKeyboardTeleopEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (!nextEnabled) {
        resetKeyboardMotion(true);
      }
      return nextEnabled;
    });
  }

  useEffect(() => {
    if (!showTask1CameraPreview || !cameraSnapshotProxyUrl) {
      return undefined;
    }

    const timer = window.setInterval(() => setCameraToken(Date.now()), CAMERA_FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [cameraSnapshotProxyUrl, showTask1CameraPreview]);

  useEffect(() => {
    if (!keyboardTeleopEnabled) {
      resetKeyboardMotion(false);
      return undefined;
    }

    function startRepeat(command) {
      clearKeyboardRepeat();
      keyboardRepeatTimerRef.current = window.setInterval(() => {
        submitManualCommand(command);
      }, KEYBOARD_REPEAT_MS);
    }

    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        resetKeyboardMotion(false);
        submitManualCommand({ type: 'emergency_stop' }, '键盘急停已发送');
        return;
      }

      const key = event.key.toLowerCase();
      const command = KEYBOARD_TELEOP_COMMANDS[key];
      if (!command || keyboardActiveKeyRef.current === key) {
        return;
      }

      if (keyboardActiveKeyRef.current) {
        submitManualCommand(KEYBOARD_STOP_COMMAND);
      }

      event.preventDefault();
      keyboardActiveKeyRef.current = key;
      setKeyboardTeleopKey(key);
      submitManualCommand(command, `${KEYBOARD_TELEOP_LABELS[key]} 已发送`);
      startRepeat(command);
    }

    function handleKeyUp(event) {
      const key = event.key.toLowerCase();
      if (!KEYBOARD_TELEOP_COMMANDS[key] || keyboardActiveKeyRef.current !== key) {
        return;
      }

      event.preventDefault();
      resetKeyboardMotion(true);
    }

    function handleBlur() {
      if (keyboardActiveKeyRef.current) {
        resetKeyboardMotion(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      clearKeyboardRepeat();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [keyboardTeleopEnabled, manualCommand]);

  async function submitPcBrainAction(action, task = 'task1') {
    const endpoint = PC_BRAIN_ENDPOINTS[action];
    if (!endpoint) return;

    setBusyAction(`pc-brain-${action}-${task}`);
    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'start'
          ? JSON.stringify({ task, targetLabel: task === 'task2' ? targetLabel : '', source: 'opencv' })
          : JSON.stringify({ reason: 'operator_stop' })
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || 'PC Brain 请求失败');
      }
      onPcBrainUpdate?.(payload.data);
      if (payload.finalRun) {
        onFinalRunUpdate?.(payload.finalRun);
      }
      onToast?.(
        action === 'start'
          ? task === 'task2'
            ? `Task2 已启动：${targetLabel}`
            : 'Task1 自动路线已启动'
          : 'PC Brain 已停止'
      );
    } catch (error) {
      onToast?.(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function submitRobotAutopilotAction(enabled, task = 'task1') {
    setBusyAction(`robot-autopilot-${enabled ? task : 'stop'}`);
    try {
      const response = await fetch(`${apiBase}${ROBOT_CONTROL_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vision_autopilot',
          enabled,
          task
        })
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || '机器人本体模式请求失败');
      }
      onToast?.(
        enabled
          ? task === 'task2'
            ? '本体 Task2 已启动'
            : '本体 Task1 已启动'
          : '本体模式已停止'
      );
    } catch (error) {
      onToast?.(error.message);
    } finally {
      setBusyAction('');
    }
  }

  function toggleStatusSection(section) {
    setOpenStatusSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  }

  return (
    <section className="grid two-columns page-content final-go-page">
      <article className="panel wide-panel final-go-panel">
        <div className="panel-head">
          <div>
            <h2>Final go!</h2>
            <p className="panel-note">Task1 和 Task2 分开运行：先沿路线穿过黄柱并触碰黑柱，再按抽签目标单独启动 Task2。</p>
          </div>
          <span className={`pill ${finalRun?.status === 'running' ? 'online' : 'subtle'}`}>{statusLabel}</span>
        </div>

        <div className="final-go-layout">
          <div className="final-go-main">
            <div className="final-connect-panel">
              <div className="final-connect-head">
                <strong>比赛连接</strong>
                <span>{robotConnected ? '机器人已连接' : '机器人未连接'} · {cameraConnected ? '相机已连接' : '相机未连接'}</span>
              </div>

              <div className="final-connect-grid">
                <label className="field">
                  <span>机器人 IP</span>
                  <input value={ip || ''} onChange={(event) => setIp?.(event.target.value)} placeholder="例如 192.168.10.10" />
                </label>
                <div className="final-connect-actions">
                  <button type="button" onClick={handleConnect} disabled={busy?.connect || !ip}>
                    {busy?.connect ? '连接中...' : '连接机器人'}
                  </button>
                  <button type="button" className="ghost" onClick={handleDisconnect} disabled={busy?.connect || !robotConnected}>
                    断开
                  </button>
                </div>

                <label className="field">
                  <span>相机 IP</span>
                  <input
                    value={cameraForm?.ip || ''}
                    onChange={(event) => updateCameraForm?.('ip', event.target.value)}
                    placeholder="例如 172.20.10.11"
                  />
                </label>
                <div className="final-connect-actions">
                  <button type="button" onClick={handleCameraConnect} disabled={busy?.camera || !cameraForm?.ip}>
                    {busy?.camera ? '连接中...' : '连接相机'}
                  </button>
                  <button type="button" className="ghost" onClick={handleCameraDisconnect} disabled={busy?.camera || !cameraConnected}>
                    断开
                  </button>
                </div>
              </div>
              {cameraConnectError ? <div className="control-alert error final-connect-error">{cameraConnectError}</div> : null}
            </div>

            <div className="final-target-card">
              <div className="final-target-preview">
                <TargetIcon label={targetLabel} />
              </div>
              <div className="final-target-copy">
                <span>当前目标</span>
                <strong>{targetLabel}</strong>
                <small>
                  {selectedTarget.color} / {shapeLabel}
                </small>
              </div>
              <label className="field final-target-select">
                <span>抽签后切换</span>
                <select value={targetLabel} onChange={(event) => setTargetLabel(event.target.value)}>
                  {finalRunTargetLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="final-action-row">
              <button
                type="button"
                className="final-go-button"
                onClick={() => submitPcBrainAction('start', 'task1')}
                disabled={Boolean(busyAction) || pcBrain?.status === 'running'}
              >
                {busyAction === 'pc-brain-start-task1' ? '启动中...' : 'Task1 自动路线'}
              </button>
              <button
                type="button"
                className="final-go-button"
                onClick={() => submitPcBrainAction('start', 'task2')}
                disabled={Boolean(busyAction) || pcBrain?.status === 'running'}
              >
                {busyAction === 'pc-brain-start-task2' ? '启动中...' : 'Task2 触碰目标'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => submitPcBrainAction('stop')}
                disabled={Boolean(busyAction) || pcBrain?.status !== 'running'}
              >
                {busyAction === 'pc-brain-stop-task1' ? '停止中...' : '停止 PC Brain'}
              </button>
              <button
                type="button"
                className="accent"
                onClick={() => submitRobotAutopilotAction(true, 'task1')}
                disabled={Boolean(busyAction) || pcBrain?.status === 'running'}
              >
                {busyAction === 'robot-autopilot-task1' ? '启动中...' : '本体 Task1'}
              </button>
              <button
                type="button"
                className="accent"
                onClick={() => submitRobotAutopilotAction(true, 'task2')}
                disabled={Boolean(busyAction) || pcBrain?.status === 'running'}
              >
                {busyAction === 'robot-autopilot-task2' ? '启动中...' : '本体 Task2'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => submitRobotAutopilotAction(false, 'task1')}
                disabled={Boolean(busyAction)}
              >
                {busyAction === 'robot-autopilot-stop' ? '停止中...' : '停止本体模式'}
              </button>
            </div>

            <div className={`final-keyboard-teleop ${keyboardTeleopEnabled ? 'active' : ''}`}>
              <div className="final-keyboard-teleop-head">
                <div>
                  <strong>键盘遥控</strong>
                  <span>手动操作机器人，同时观察外置大脑判断。</span>
                </div>
                <button type="button" className={keyboardTeleopEnabled ? 'danger' : 'accent'} onClick={toggleKeyboardTeleop}>
                  {keyboardTeleopEnabled ? '关闭键盘控制' : '启用键盘控制'}
                </button>
              </div>
              <div className="final-keyboard-shortcuts" aria-label="Final go 键盘控制映射">
                <span className={keyboardTeleopKey === 'w' ? 'active' : ''}>W 同步直行</span>
                <span className={keyboardTeleopKey === 's' ? 'active' : ''}>S 同步后退</span>
                <span className={keyboardTeleopKey === 'q' ? 'active' : ''}>Q 左转</span>
                <span className={keyboardTeleopKey === 'e' ? 'active' : ''}>E 右转</span>
                <span>Space 急停</span>
              </div>
            </div>

            {showTask1CameraPreview ? (
              <div className="camera-frame final-camera-panel">
                <div className="camera-frame-head">
                  <strong>Task1 视角</strong>
                  {finalCameraUrl ? <a href={finalCameraUrl} target="_blank" rel="noreferrer">打开当前帧</a> : null}
                </div>
                {finalCameraUrl ? (
                  <div className="camera-live-stage final-camera-rotated">
                    <img src={finalCameraUrl} alt="Task1 摄像头实时画面" />
                  </div>
                ) : (
                  <div className="camera-placeholder">相机未连接，请确认 ESP32-CAM 和 PC Brain 已在同一网络运行。</div>
                )}
              </div>
            ) : null}
          </div>

          <aside className="final-run-status">
            <CollapsibleInfoSection
              id="final-status-run"
              title="运行状态"
              open={openStatusSections.runStatus}
              onToggle={() => toggleStatusSection('runStatus')}
            >
              <div className="info-table">
                <div className="info-row">
                  <span>状态</span>
                  <strong>{statusLabel}</strong>
                </div>
                <div className="info-row">
                  <span>任务</span>
                  <strong>{taskLabel}</strong>
                </div>
                <div className="info-row">
                  <span>阶段</span>
                  <strong>{finalRun?.phaseLabel || '等待启动'}</strong>
                </div>
                <div className="info-row">
                  <span>后端目标</span>
                  <strong>{finalRun?.targetLabel || '--'}</strong>
                </div>
                <div className="info-row">
                  <span>最近动作</span>
                  <strong>{finalRun?.lastAction || '--'}</strong>
                </div>
                <div className="info-row">
                  <span>更新时间</span>
                  <strong>{formatTime(finalRun?.updatedAt)}</strong>
                </div>
                <div className="info-row">
                  <span>PC Brain</span>
                  <strong>{pcBrainStatusLabel}</strong>
                </div>
                <div className="info-row">
                  <span>本体模式</span>
                  <strong>按钮触发</strong>
                </div>
                <div className="info-row">
                  <span>视觉帧</span>
                  <strong>{pcBrain?.frameCount || 0}</strong>
                </div>
                <div className="info-row">
                  <span>最近检测数</span>
                  <strong>{pcBrain?.lastDetectionCount || 0}</strong>
                </div>
              </div>
            </CollapsibleInfoSection>

            <CollapsibleInfoSection
              id="final-status-external-brain"
              title="外置大脑判断"
              open={openStatusSections.externalBrain}
              onToggle={() => toggleStatusSection('externalBrain')}
            >
              <div className="info-table">
                <div className="info-row">
                  <span>模型</span>
                  <strong>{externalBrain.model || '--'}</strong>
                </div>
                <div className="info-row">
                  <span>模型场景</span>
                  <strong>{externalBrain.scene || 'uncertain'}</strong>
                </div>
                <div className="info-row">
                  <span>置信度</span>
                  <strong>{formatConfidence(externalBrain.confidence)}</strong>
                </div>
                <div className="info-row">
                  <span>建议动作</span>
                  <strong>{externalBrain.suggestedAction || 'none'}</strong>
                </div>
                <div className="info-row">
                  <span>耗时</span>
                  <strong>{formatLatencyMs(externalBrain.latencyMs)}</strong>
                </div>
                <div className="info-row">
                  <span>更新时间</span>
                  <strong>{formatTime(externalBrain.updatedAt)}</strong>
                </div>
                <div className="info-row">
                  <span>判断原因</span>
                  <strong>{externalBrain.reason || '--'}</strong>
                </div>
              </div>
            </CollapsibleInfoSection>

            <CollapsibleInfoSection
              id="final-status-ultrasonic"
              title="超声波测试"
              open={openStatusSections.ultrasonic}
              onToggle={() => toggleStatusSection('ultrasonic')}
            >
              <div className="info-table">
                <div className="info-row">
                  <span>配置</span>
                  <strong>{ultrasonic?.configured ? '已启用' : '未启用'}</strong>
                </div>
                <div className="info-row">
                  <span>中置距离</span>
                  <strong>{formatDistanceCm(ultrasonic?.centerCm, ultrasonic?.centerValid)}</strong>
                </div>
                <div className="info-row">
                  <span>中置状态</span>
                  <strong>{ultrasonicDistanceStatus(ultrasonic?.centerCm, ultrasonic?.centerValid, ultrasonic?.centerNear, ultrasonic?.centerDanger)}</strong>
                </div>
                <div className="info-row">
                  <span>更新时间</span>
                  <strong>{formatTime(ultrasonic?.lastUpdatedAt)}</strong>
                </div>
              </div>
            </CollapsibleInfoSection>

            <CollapsibleInfoSection
              id="final-status-imu"
              title="IMU 直行诊断"
              open={openStatusSections.imu}
              onToggle={() => toggleStatusSection('imu')}
            >
              <div className="info-table">
                <div className="info-row">
                  <span>纠偏状态</span>
                  <strong>{gaitTelemetry?.ottoStraightAssistActive ? '自动纠偏' : '仅监测'}</strong>
                </div>
                <div className="info-row">
                  <span>诊断状态</span>
                  <strong>{gaitTelemetry?.ottoStraightDiagnosticRunning ? '记录中' : ottoDiagnosticAvailable ? '已保留' : '等待直行'}</strong>
                </div>
                <div className="info-row">
                  <span>已直行</span>
                  <strong>{formatElapsedMs(gaitTelemetry?.ottoElapsedMs)}</strong>
                </div>
                <div className="info-row">
                  <span>当前 yaw</span>
                  <strong>{formatDegrees(gaitTelemetry?.ottoCurrentYaw)}</strong>
                </div>
                <div className="info-row">
                  <span>起步 yaw</span>
                  <strong>{formatDegrees(gaitTelemetry?.ottoBaselineYaw)}</strong>
                </div>
                <div className="info-row">
                  <span>偏航角</span>
                  <strong>{formatDegrees(gaitTelemetry?.ottoYawError)}</strong>
                </div>
                <div className="info-row">
                  <span>偏航方向</span>
                  <strong>{yawDirectionLabel(gaitTelemetry?.ottoYawDirection)}</strong>
                </div>
                <div className="info-row">
                  <span>最大偏航</span>
                  <strong>{formatDegrees(gaitTelemetry?.ottoMaxAbsYawError)}</strong>
                </div>
              </div>
            </CollapsibleInfoSection>

            <ol className="final-run-steps">
              <li>等待启动</li>
              <li>Task1: 起步向上接近第一个黄柱</li>
              <li>Task1: 右绕第一个黄柱</li>
              <li>Task1: 从第二排两个黄柱中间穿过</li>
              <li>Task1: 触碰黑色终点柱</li>
              <li>Task2: 单独搜索 {targetLabel}</li>
              <li>Task2: 对准并轻触目标物块</li>
            </ol>
          </aside>
        </div>
      </article>
    </section>
  );
}
