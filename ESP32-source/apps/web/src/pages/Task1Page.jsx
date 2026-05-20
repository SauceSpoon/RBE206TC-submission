import { useState } from 'react';

export default function Task1Page({ manualCommand, onToast }) {
  const [busy, setBusy] = useState(false);

  async function startFrontPoleBypass() {
    if (!manualCommand) return;
    setBusy(true);
    try {
      await manualCommand({ type: 'task1_front_pole_bypass' });
      onToast?.('已启动：绕正前方柱子');
    } catch (error) {
      onToast?.(error.message || '启动绕柱失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-grid">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Task1</p>
            <h2>task1</h2>
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={startFrontPoleBypass} disabled={busy || !manualCommand}>
            {busy ? '启动中...' : '绕正前方柱子'}
          </button>
        </div>
      </article>
    </section>
  );
}
