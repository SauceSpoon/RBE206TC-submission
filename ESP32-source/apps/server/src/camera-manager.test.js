import assert from 'node:assert/strict';
import test from 'node:test';

import { CameraManager } from './camera-manager.js';

function createStore() {
  const state = {
    camera: {
      connected: false,
      status: 'disconnected',
      lastError: null,
      lastCheckedAt: null
    }
  };

  return {
    snapshot() {
      return structuredClone(state);
    },
    updateCamera(partial) {
      state.camera = {
        ...state.camera,
        ...partial
      };
    },
    addLog() {}
  };
}

test('transient camera status failures do not immediately mark an online camera offline', async () => {
  const originalFetch = globalThis.fetch;
  const store = createStore();
  const manager = new CameraManager(store, {
    connectTimeoutMs: 10,
    maxStatusFailures: 3
  });

  try {
    globalThis.fetch = async () => ({
      ok: true,
      async json() {
        return {
          found: true,
          label: 'RED_CUBE',
          confidence: 0.5,
          frameWidth: 320,
          frameHeight: 240
        };
      }
    });

    await manager.connect({
      ip: '172.20.10.11',
      streamPath: '/capture',
      snapshotPath: '/capture',
      statusPath: '/status'
    });
    assert.equal(store.snapshot().camera.connected, true);

    globalThis.fetch = async () => {
      throw new Error('timeout');
    };

    await manager.fetchStatus();

    const camera = store.snapshot().camera;
    assert.equal(camera.connected, true);
    assert.equal(camera.status, 'degraded');
    assert.equal(camera.lastError, 'timeout');
    assert.equal(camera.detection.label, 'RED_CUBE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
