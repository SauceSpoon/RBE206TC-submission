import {
  StatusCard,
  actionButtons as defaultActionButtons,
  formatValue,
  formatSignedValue,
  ottoMotionProfileFields as defaultOttoMotionProfileFields,
  ottoMotionProfileSelector as defaultOttoMotionProfileSelector,
  moveButtons as defaultMoveButtons,
  servoControls as defaultServoControls
} from '../dashboard-config.jsx';

export default function ControlPage({
  dashboard,
  handleCommand,
  centerAllServos,
  factoryCenterAllServos,
  captureCurrentPoseAsZero,
  servoDrafts,
  updateServo,
  commitServo,
  trimRange,
  servoTrimDrafts,
  updateServoTrim,
  commitServoTrim,
  servoLiveMode,
  setServoLiveMode,
  title = '实时控制区',
  description = '先聚焦前进方向的企鹅步测试，其他方向暂时留空',
  shortcutLabel = '↑ 前进测试',
  activeMotionKey = null,
  keyboardControlMode = 'stable',
  setKeyboardControlMode,
  keyboardActionButtons = [],
  actionButtons = defaultActionButtons,
  moveTitle = '移动',
  moveButtons = defaultMoveButtons,
  secondaryMoveTitle = '',
  secondaryMoveButtons = [],
  testMoveTitle = '',
  testMoveButtons = [],
  servoControls = defaultServoControls,
  ottoMotionDrafts,
  selectedOttoMotion,
  setSelectedOttoMotion,
  ottoMotionProfileSelector = defaultOttoMotionProfileSelector,
  ottoMotionProfileFields = defaultOttoMotionProfileFields,
  updateOttoMotionDraft,
  restoreOttoMotionDefaults,
  testOttoMotionProfile,
  saveOttoMotionProfile,
  ottoMotionSaveStatus
}) {
  const build = dashboard.runtime.build;
  const robotConnected = Boolean(dashboard.robot.connected);
  const driverReady = Boolean(build?.servoDriverReady);
  const driverStatusLabel = !robotConnected
    ? '未连接'
    : driverReady
      ? 'PCA9685 正常'
      : 'PCA9685 未识别';
  const driverStatusAccent = !robotConnected ? 'warn' : driverReady ? 'good' : 'warn';
  const showDriverWarning = Boolean(robotConnected && build && !driverReady);
  const batteryLabel =
    typeof dashboard.robot.battery === 'number' ? `${dashboard.robot.battery} V` : '--';
  const servoAngleRange = build?.angleRange || {
    min: 10,
    max: 170
  };

  function clampServoAngle(angle) {
    return Math.min(servoAngleRange.max, Math.max(servoAngleRange.min, angle));
  }

  function handleServoKeyDown(event, id) {
    if (event.repeat || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextAngle = clampServoAngle(Number(servoDrafts[id]) + direction);

    updateServo(id, nextAngle);
    commitServo(id, nextAngle);
  }

  const selectedOttoMotionMeta =
    ottoMotionProfileSelector.find((item) => item.id === selectedOttoMotion) ||
    ottoMotionProfileSelector[0];
  const selectedOttoMotionDraft =
    selectedOttoMotion && ottoMotionDrafts ? ottoMotionDrafts[selectedOttoMotion] : null;
  const showOttoMotionEditor = Boolean(
    updateOttoMotionDraft &&
      restoreOttoMotionDefaults &&
      testOttoMotionProfile &&
      saveOttoMotionProfile &&
      selectedOttoMotionMeta &&
      selectedOttoMotionDraft
  );
  const selectedOttoMotionSaveStatus =
    ottoMotionSaveStatus?.motionId === selectedOttoMotion ? ottoMotionSaveStatus : null;
  const isSavingOttoMotion = selectedOttoMotionSaveStatus?.state === 'saving';
  const keyboardMotionKeyMap = {
    w: {
      label: 'W',
      action:
        keyboardControlMode === 'super'
          ? '超级同步直行'
          : keyboardControlMode === 'aggressive'
            ? '激进同步直行'
            : '同步直行'
    },
    s: { label: 'S', action: '同步后退' },
    q: {
      label: 'Q',
      action: keyboardControlMode === 'smooth' ? '左转' : '左快'
    },
    e: { label: 'E', action: '右转' }
  };

  return (
    <section className="grid two-columns page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="muted">{description}</span>
        </div>

        <div className="status-grid control-status-grid">
          <StatusCard
            label="机器人连接"
            value={robotConnected ? '在线' : '离线'}
            accent={robotConnected ? 'good' : 'warn'}
          />
          <StatusCard
            label="舵机驱动"
            value={driverStatusLabel}
            accent={driverStatusAccent}
          />
          <StatusCard label="电池电压" value={batteryLabel} />
          <StatusCard
            label="控制延迟"
            value={formatValue(dashboard.robot.latencyMs, ' ms')}
            accent={
              typeof dashboard.robot.latencyMs === 'number' && dashboard.robot.latencyMs <= 120
                ? 'good'
                : undefined
            }
          />
        </div>

        <div className="shortcut-strip">
          <span className="shortcut-pill">Space 急停</span>
          <span className="shortcut-pill">Esc 停止移动</span>
          <span className="shortcut-pill">{shortcutLabel}</span>
        </div>

        {setKeyboardControlMode ? (
          <div className="shortcut-strip" aria-label="键盘模式">
            <button
              type="button"
              className={keyboardControlMode === 'smooth' ? 'accent' : 'ghost'}
              onClick={() => setKeyboardControlMode('smooth')}
            >
              平稳键盘
            </button>
            <button
              type="button"
              className={keyboardControlMode === 'stable' ? 'accent' : 'ghost'}
              onClick={() => setKeyboardControlMode('stable')}
            >
              稳定键盘
            </button>
            <button
              type="button"
              className={keyboardControlMode === 'super' ? 'accent' : 'ghost'}
              onClick={() => setKeyboardControlMode('super')}
            >
              超级键盘
            </button>
            <button
              type="button"
              className={keyboardControlMode === 'aggressive' ? 'accent' : 'ghost'}
              onClick={() => setKeyboardControlMode('aggressive')}
            >
              激进键盘
            </button>
            {keyboardActionButtons.map((item) => (
              <button
                key={item.label}
                type="button"
                className="ghost"
                onClick={() => handleCommand(item.payload)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {activeMotionKey ? (() => {
          const info = keyboardMotionKeyMap[activeMotionKey];
          return info ? (
            <div className="shortcut-strip">
              <span className="shortcut-pill" style={{background:'rgba(74,144,226,0.25)',borderColor:'rgba(74,144,226,0.5)'}}>
                ⌨ 按住 {info.label} 持续{info.action}
              </span>
            </div>
          ) : null;
        })() : null}

        {showDriverWarning ? (
          <div className="control-alert error">
            <strong>⚠️ 舵机驱动未就绪</strong>
            <p>{build.lastDriverError || '请检查 I2C 接线、PCA9685 供电与设备地址。'}</p>
          </div>
        ) : null}

        {actionButtons.length > 0 ? (
          <div className="control-block">
            <p className="block-title">动作</p>
            <div className="button-grid">
              {actionButtons.map((item) => (
                <button
                  key={item.label}
                  className={item.danger ? 'danger' : ''}
                  onClick={() => handleCommand(item.payload)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="control-block">
          <p className="block-title">{moveTitle}</p>
          <div className="button-grid">
            {moveButtons.map((item) => (
              <button
                key={item.label}
                className="ghost"
                onClick={() => handleCommand(item.payload)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {secondaryMoveButtons.length > 0 ? (
          <div className="control-block">
            <p className="block-title">{secondaryMoveTitle || '移动'}</p>
            <div className="button-grid">
              {secondaryMoveButtons.map((item) => (
                <button
                  key={item.label}
                  className="ghost"
                  onClick={() => handleCommand(item.payload)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {testMoveButtons.length > 0 ? (
          <div className="control-block">
            <p className="block-title">{testMoveTitle || '测试区'}</p>
            <div className="button-grid">
              {testMoveButtons.map((item) => (
                <button
                  key={item.label}
                  className="ghost"
                  onClick={() => handleCommand(item.payload)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showOttoMotionEditor ? (
          <div className="control-block otto-motion-editor">
            <div className="panel-head otto-motion-head">
              <div>
                <p className="block-title">动作参数</p>
                <h2>{selectedOttoMotionMeta.label}</h2>
              </div>
              <div className="button-row otto-motion-selector" role="tablist" aria-label="Otto 动作切换">
                {ottoMotionProfileSelector.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedOttoMotion === item.id ? 'selected' : 'ghost'}
                    onClick={() => setSelectedOttoMotion(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="otto-motion-grid">
              {ottoMotionProfileFields.map((field) => (
                <label className="otto-motion-row" key={field.id}>
                  <div className="otto-motion-meta">
                    <span>{field.label}</span>
                    <strong>{formatValue(selectedOttoMotionDraft[field.id], '°')}</strong>
                  </div>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={selectedOttoMotionDraft[field.id]}
                    onChange={(event) =>
                      updateOttoMotionDraft(selectedOttoMotion, field.id, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>

            <div className="button-row">
              <button className="ghost" type="button" onClick={() => restoreOttoMotionDefaults()}>
                恢复当前动作默认值
              </button>
              <button type="button" onClick={() => testOttoMotionProfile()}>
                测试当前动作
              </button>
              <button
                className="accent"
                type="button"
                onClick={() => saveOttoMotionProfile()}
                disabled={isSavingOttoMotion}
              >
                {isSavingOttoMotion ? '保存中...' : '保存到机器人'}
              </button>
            </div>
            {selectedOttoMotionSaveStatus?.message ? (
              <div
                className={`otto-motion-save-status ${selectedOttoMotionSaveStatus.state}`}
                role="status"
                aria-live="polite"
              >
                {selectedOttoMotionSaveStatus.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>舵机调节区</h2>
          <span className="muted">
            {showDriverWarning
              ? '驱动异常时已禁用舵机调节'
              : servoLiveMode
                ? '拖动滑块时会实时发送角度'
                : '松开滑块后发送角度'}
          </span>
        </div>

        <div className="live-servo-toolbar">
          <button
            type="button"
            className={servoLiveMode ? 'selected' : 'ghost'}
            onClick={() => setServoLiveMode((current) => !current)}
            disabled={showDriverWarning}
          >
            实时模式：{servoLiveMode ? '开' : '关'}
          </button>
          <span className="muted">开启后会按节流连续发送，方便实时观察舵机姿态。</span>
        </div>

        {servoControls.map(({ id, label, channel }) => (
          <label className={`servo-row ${showDriverWarning ? 'is-disabled' : ''}`} key={id}>
            <div className="servo-meta">
              <div className="servo-label-group">
                <span>{label}</span>
                <small>CH {channel}</small>
              </div>
              <strong>{servoDrafts[id]}°</strong>
            </div>
            <input
              type="range"
              min={servoAngleRange.min}
              max={servoAngleRange.max}
              step="1"
              value={servoDrafts[id]}
              disabled={showDriverWarning}
              onChange={(event) => updateServo(id, event.target.value)}
              onKeyDown={(event) => handleServoKeyDown(event, id)}
              onMouseUp={(event) => commitServo(id, event.currentTarget.value)}
              onTouchEnd={(event) => commitServo(id, event.currentTarget.value)}
            />
          </label>
        ))}

        <div className="trim-section">
          <div className="panel-head trim-head">
            <h2>零位校准</h2>
            <div className="button-grid">
              <button
                className="ghost"
                type="button"
                onClick={centerAllServos}
                disabled={showDriverWarning}
              >
                回到当前零位
              </button>
              <button
                className="ghost"
                type="button"
                onClick={factoryCenterAllServos}
                disabled={showDriverWarning}
              >
                回到装配归中（物理90°）
              </button>
              <button
                className="ghost"
                type="button"
                onClick={captureCurrentPoseAsZero}
                disabled={showDriverWarning}
              >
                把当前姿态设为零位
              </button>
            </div>
          </div>

          <p className="panel-note">
            “回到当前零位”会使用当前保存的零位偏移；“回到装配归中（物理90°）”会清空全部零位偏移，再把所有舵机打到物理 90 度；如果左右腿分别还有偏差，先把每个舵机调到你满意的位置，再点“把当前姿态设为零位”保存。
          </p>

          {servoControls.map(({ id, label }) => (
            <label className={`trim-row ${showDriverWarning ? 'is-disabled' : ''}`} key={`trim-${id}`}>
              <div className="trim-meta">
                <span>{label}</span>
                <strong>{formatSignedValue(servoTrimDrafts[id], '°')}</strong>
              </div>
              <input
                type="range"
                min={trimRange.min}
                max={trimRange.max}
                value={servoTrimDrafts[id]}
                disabled={showDriverWarning}
                onChange={(event) => updateServoTrim(id, event.target.value)}
                onMouseUp={(event) => commitServoTrim(id, event.currentTarget.value)}
                onTouchEnd={(event) => commitServoTrim(id, event.currentTarget.value)}
              />
            </label>
          ))}
        </div>
      </article>
    </section>
  );
}
