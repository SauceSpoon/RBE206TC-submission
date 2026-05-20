import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { ScriptRunner } from './script-runner.js';

class FakeStore extends EventEmitter {
  constructor() {
    super();
    this.state = {
      robot: {
        ip: '192.168.4.1'
      },
      scriptRunner: {}
    };
    this.logs = [];
  }

  snapshot() {
    return structuredClone(this.state);
  }

  updateScriptRunner(partial) {
    this.state.scriptRunner = {
      ...this.state.scriptRunner,
      ...partial
    };
  }

  addLog(level, message) {
    this.logs.push({ level, message });
  }
}

class ReconnectingRobotManager extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.commands = [];
  }

  isConnected() {
    return this.connected;
  }

  async connect() {
    this.connected = true;
  }

  async fetchStatus() {
    return null;
  }

  async sendCommand(command, options = {}) {
    if (!this.connected && options.waitForReconnect) {
      await new Promise((resolve) => {
        this.once('connected', resolve);
      });
    }

    if (!this.connected) {
      throw new Error('机器人尚未连接');
    }

    this.commands.push(command);
  }
}

test('script servo steps wait for a transient reconnect instead of failing', async () => {
  const store = new FakeStore();
  const robotManager = new ReconnectingRobotManager();
  const runner = new ScriptRunner(store, robotManager);

  await runner.run({
    script: '等待50毫秒\n左膝转到96度',
    ip: '192.168.4.1',
    servoId: 1
  });

  robotManager.connected = false;
  setTimeout(() => {
    robotManager.connected = true;
    robotManager.emit('connected');
  }, 80);

  await new Promise((resolve) => setTimeout(resolve, 130));

  assert.deepEqual(robotManager.commands, [
    {
      type: 'servo',
      id: 1,
      angle: 96
    }
  ]);
  assert.equal(store.state.scriptRunner.status, 'completed');
});
