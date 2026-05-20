import {
  StatusCard,
  defaultOttoPhysicalParams,
  formatParameterValue,
  formatTime,
  formatValue
} from '../dashboard-config.jsx';

const physicalFields = [
  ['totalMassKg', '总质量 kg', 0.05, 5, 0.01],
  ['legLengthMm', '腿长 mm', 20, 180, 1],
  ['footLengthMm', '脚长 mm', 20, 160, 1],
  ['footWidthMm', '脚宽 mm', 10, 120, 1],
  ['centerOfMassHeightMm', '重心高度 mm', 20, 220, 1],
  ['servoMaxSpeedDegPerSec', '舵机速度 °/s', 60, 900, 10],
  ['servoTorqueKgCm', '舵机扭矩 kg·cm', 0.4, 12, 0.1],
  ['footFriction', '脚底摩擦', 0.1, 1.4, 0.01],
  ['nominalStrideScale', '步长校正', 0.3, 2, 0.01]
];

const gaitParamLabels = {
  hipSwingDeg: '髋摆幅',
  kneeLiftDeg: '抬腿幅度',
  doubleSupportMs: '双支撑',
  swingPhaseMs: '摆腿周期',
  torsoLeadDeg: '前倾'
};

function clampPercent(value) {
  return `${Math.max(0, Math.min(100, Number(value || 0) * 100))}%`;
}

function OttoSkeleton({ metrics, params }) {
  const hipSwing = Number(params?.hipSwingDeg || 12);
  const kneeLift = Number(params?.kneeLiftDeg || 16);
  const torsoLead = Number(params?.torsoLeadDeg || 0);
  const leftHipX = 130 - hipSwing * 0.9;
  const rightHipX = 190 + hipSwing * 0.9;
  const kneeY = 138 - kneeLift * 0.35;
  const leftFootX = 120 - hipSwing * 0.45;
  const rightFootX = 202 + hipSwing * 0.45;
  const comX = 160 + torsoLead * 1.8;
  const comY = 94;

  return (
    <div className="sim-visual">
      <svg viewBox="0 0 320 220" role="img" aria-label="OTTO 2D 骨架仿真">
        <line className="sim-ground" x1="36" y1="188" x2="284" y2="188" />
        <rect className="sim-foot" x={leftFootX - 28} y="178" width="56" height="12" rx="4" />
        <rect className="sim-foot" x={rightFootX - 28} y="178" width="56" height="12" rx="4" />
        <line className="sim-limb" x1="142" y1="92" x2={leftHipX} y2="124" />
        <line className="sim-limb" x1={leftHipX} y1="124" x2={leftFootX} y2="178" />
        <line className="sim-limb" x1="178" y1="92" x2={rightHipX} y2="124" />
        <line className="sim-limb" x1={rightHipX} y1="124" x2={rightFootX} y2="178" />
        <rect className="sim-body" x="124" y="46" width="72" height="58" rx="10" transform={`rotate(${torsoLead} 160 75)`} />
        <circle className="sim-joint" cx="142" cy="92" r="5" />
        <circle className="sim-joint" cx="178" cy="92" r="5" />
        <circle className="sim-joint" cx={leftHipX} cy="124" r="5" />
        <circle className="sim-joint" cx={rightHipX} cy="124" r="5" />
        <circle className="sim-com" cx={comX} cy={comY} r="7" />
        <line className="sim-com-line" x1={comX} y1={comY} x2={comX} y2="188" />
      </svg>
      <div className="sim-bars">
        <div>
          <span>速度</span>
          <div className="sim-meter">
            <i style={{ width: clampPercent(Number(metrics.speedMps || 0) / 0.28) }} />
          </div>
        </div>
        <div>
          <span>稳定</span>
          <div className="sim-meter">
            <i style={{ width: clampPercent(metrics.stabilityScore) }} />
          </div>
        </div>
        <div>
          <span>风险</span>
          <div className="sim-meter warn">
            <i style={{ width: clampPercent(metrics.fallRisk) }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ParamSummary({ params }) {
  if (!params) {
    return <p className="empty-log">还没有步态参数。</p>;
  }

  return (
    <div className="param-grid compact">
      {Object.entries(gaitParamLabels).map(([key, label]) => (
        <div className="param-card" key={key}>
          <span>{label}</span>
          <strong>{formatParameterValue(key, params[key])}</strong>
        </div>
      ))}
    </div>
  );
}

export default function SimulationPage({
  simulation,
  physicalParams,
  updatePhysicalParam,
  calibrationForm,
  updateCalibrationForm,
  busy,
  handleImportSimCad,
  handleSavePhysicalParams,
  handleConnectSimulation,
  handleDisconnectSimulation,
  handleRunSimulationTrial,
  handleManualCalibration,
  handleRecommendSimulation,
  handleExportMuJoCoDraft,
  handleRunMuJoCoSimulation
}) {
  const profile = simulation.profiles?.otto || {};
  const metrics = simulation.metrics || {};
  const currentParams = simulation.currentParams || profile.gaitDefaults;
  const latestRecommendation = simulation.recommendations?.[0];
  const digitalTwin = simulation.digitalTwin || {};
  const runtime = digitalTwin.runtime || {};

  return (
    <section className="grid page-content">
      <article className="panel wide-panel">
        <div className="panel-head">
          <h2>OTTO 本地仿真</h2>
          <span className="muted">2D 指标模型 · MuJoCo-ready 参数档案</span>
        </div>

        <div className="status-grid sim-status-grid">
          <StatusCard
            label="仿真连接"
            value={simulation.connected ? '已连接' : '未连接'}
            accent={simulation.connected ? 'good' : 'warn'}
          />
          <StatusCard
            label="CAD 状态"
            value={simulation.modelStatus === 'imported' ? '已导入 OTTO' : '未导入'}
            accent={simulation.modelStatus === 'imported' ? 'good' : 'warn'}
          />
          <StatusCard label="速度" value={formatValue(metrics.speedMps, ' m/s')} />
          <StatusCard label="稳定" value={formatValue(metrics.stabilityScore)} />
          <StatusCard label="风险" value={formatValue(metrics.fallRisk)} accent={metrics.fallRisk > 0.65 ? 'warn' : undefined} />
          <StatusCard label="校准倍率" value={formatValue(simulation.calibration?.speedScale)} />
        </div>

        <div className="button-row">
          <button className="accent" onClick={handleImportSimCad} disabled={busy.simulation}>
            {busy.simulation ? '处理中...' : '导入 OTTO CAD'}
          </button>
          <button className="ghost" onClick={handleConnectSimulation} disabled={busy.simulation}>
            连接本地仿真
          </button>
          <button className="ghost" onClick={handleDisconnectSimulation} disabled={busy.simulation || !simulation.connected}>
            断开仿真
          </button>
          <button onClick={handleRunSimulationTrial} disabled={busy.simulation || !simulation.connected}>
            跑一轮步态
          </button>
          <button className="ghost" onClick={handleRecommendSimulation} disabled={busy.simulation || !simulation.connected}>
            AI 参数建议
          </button>
          <button className="ghost" onClick={handleExportMuJoCoDraft} disabled={busy.simulation || simulation.modelStatus !== 'imported'}>
            生成 MuJoCo 草案
          </button>
          <button className="ghost" onClick={handleRunMuJoCoSimulation} disabled={busy.simulation || !digitalTwin.xml}>
            运行 MuJoCo 动态仿真
          </button>
          <a className="button-link ghost" href="#simulation-3d">
            打开 3D 预览
          </a>
        </div>
      </article>

      <div className="grid two-columns">
        <article className="panel">
          <div className="panel-head">
            <h2>2D 骨架与指标</h2>
            <span className="muted">{metrics.confidence === 'calibrated' ? '已校准' : '未校准'}</span>
          </div>
          <OttoSkeleton metrics={metrics} params={currentParams} />
          <div className="info-table">
            <div className="info-row">
              <span>前进距离</span>
              <strong>{formatValue(metrics.forwardProgress, ' m')}</strong>
            </div>
            <div className="info-row">
              <span>步数 / 步频</span>
              <strong>
                {metrics.stepCount ?? '--'} / {formatValue(metrics.cadenceStepsPerSecond, ' step/s')}
              </strong>
            </div>
            <div className="info-row">
              <span>最后更新</span>
              <strong>{formatTime(metrics.updatedAt)}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>当前步态参数</h2>
            <span className="muted">速度优先，稳定约束</span>
          </div>
          <ParamSummary params={currentParams} />

          {latestRecommendation ? (
            <div className="recommendation-card">
              <p className="block-title">最新建议</p>
              <ParamSummary params={latestRecommendation.params} />
              <p>{latestRecommendation.reason}</p>
              <small>{formatTime(latestRecommendation.createdAt)}</small>
            </div>
          ) : (
            <p className="panel-note">还没有建议。连接仿真并跑一轮步态后可生成下一组参数。</p>
          )}
        </article>
      </div>

      <div className="grid two-columns">
        <article className="panel">
          <div className="panel-head">
            <h2>物理参数</h2>
            <span className="muted">CAD 几何 + 手动补参</span>
          </div>
          <div className="physical-param-grid">
            {physicalFields.map(([key, label, min, max, step]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={physicalParams[key] ?? defaultOttoPhysicalParams[key]}
                  onChange={(event) => updatePhysicalParam(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <button className="accent" onClick={handleSavePhysicalParams} disabled={busy.simulation}>
            保存物理参数
          </button>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>校准与追踪</h2>
            <span className="muted">俯视标记追踪预留</span>
          </div>
          <div className="script-config-grid">
            <label className="field">
              <span>实测距离 m</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={calibrationForm.distanceMeters}
                onChange={(event) => updateCalibrationForm('distanceMeters', event.target.value)}
              />
            </label>
            <label className="field">
              <span>实测用时 ms</span>
              <input
                type="number"
                min="100"
                step="100"
                value={calibrationForm.durationMs}
                onChange={(event) => updateCalibrationForm('durationMs', event.target.value)}
              />
            </label>
          </div>
          <label className="field checkbox-field">
            <span>本轮跌倒</span>
            <input
              type="checkbox"
              checked={calibrationForm.fallen}
              onChange={(event) => updateCalibrationForm('fallen', event.target.checked)}
            />
          </label>
          <div className="button-row">
            <button className="accent" onClick={handleManualCalibration} disabled={busy.simulation}>
              录入校准
            </button>
            <button className="ghost" disabled>
              俯视标记追踪
            </button>
          </div>
          <p className="panel-note">{simulation.tracking?.message}</p>
          <div className="history-list compact">
            {(simulation.calibration?.manualSamples || []).slice(-4).reverse().map((sample) => (
              <div className="history-entry" key={sample.recordedAt}>
                <div className="history-meta">
                  <strong>{formatValue(sample.measuredSpeedMps, ' m/s')}</strong>
                  <span>{sample.fallen ? '跌倒' : '稳定'}</span>
                </div>
                <small>{formatTime(sample.recordedAt)}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel wide-panel">
        <div className="panel-head">
          <h2>MuJoCo 数字孪生（C 步）</h2>
          <span className="muted">
            {digitalTwin.status === 'mjcf_draft' ? 'MJCF 草案已生成' : '等待生成 MJCF 草案'}
          </span>
        </div>

        <div className="status-grid sim-status-grid">
          <StatusCard label="引擎" value={digitalTwin.engine || 'mujoco'} />
          <StatusCard label="状态" value={digitalTwin.status || 'not_exported'} />
          <StatusCard label="模型名" value={digitalTwin.modelName || '--'} />
          <StatusCard label="导出时间" value={formatTime(digitalTwin.exportedAt)} />
        </div>

        <div className="status-grid sim-status-grid">
          <StatusCard
            label="MuJoCo 加载"
            value={runtime.loaded ? '已加载并运行' : '未运行'}
            accent={runtime.loaded ? 'good' : 'warn'}
          />
          <StatusCard label="MuJoCo 版本" value={runtime.mujocoVersion || '--'} />
          <StatusCard label="仿真步数" value={runtime.stepCount || '--'} />
          <StatusCard label="根节点高度" value={formatValue(runtime.finalRootZ, ' m')} />
          <StatusCard label="动态位移" value={formatValue(runtime.forwardProgress, ' m')} />
          <StatusCard
            label="动态跌倒"
            value={runtime.loaded ? (runtime.fallen ? '是' : '否') : '--'}
            accent={runtime.fallen ? 'warn' : runtime.loaded ? 'good' : undefined}
          />
        </div>

        <div className="info-table">
          <div className="info-row">
            <span>源 CAD</span>
            <strong>{digitalTwin.sourceCad || profile.geometry?.primaryCad || '--'}</strong>
          </div>
          <div className="info-row">
            <span>当前阶段</span>
            <strong>先生成可加载结构草案；STEP 网格转换、质量惯量、接触参数校准是下一步。</strong>
          </div>
        </div>

        {digitalTwin.todo?.length ? (
          <div className="mujoco-todo">
            <p className="block-title">进入高保真前必须补齐</p>
            {digitalTwin.todo.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}

        <label className="field">
          <span>MJCF 预览</span>
          <textarea
            className="mujoco-xml-preview"
            readOnly
            value={digitalTwin.xml || '点击“生成 MuJoCo 草案”后，这里会显示 MJCF XML。'}
          />
        </label>
      </article>
    </section>
  );
}
