import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

function joinUrl(ip, path) {
  if (!path.startsWith('/')) {
    return `http://${ip}/${path}`;
  }

  return `http://${ip}${path}`;
}

function toWebSocketUrl(ip, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `ws://${ip}${normalizedPath}`;
}

export class RobotManager extends EventEmitter {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.options = {
      wsPath: '/ws',
      statusPath: '/status',
      controlPath: '/control',
      pingIntervalMs: 5000,
      maxHeartbeatFailures: 2,
      reconnectDelayMs: 1500,
      ...options
    };
    this.robotSocket = null;
    this.robotIp = '';
    this.heartbeat = null;
    this.heartbeatFailures = 0;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.manualDisconnectRequested = false;
  }

  async connect(ip) {
    if (!ip) {
      throw new Error('缺少机器人 IP');
    }

    if (this.robotIp === ip && this.isConnected()) {
      return this.store.snapshot().robot;
    }

    this.clearReconnectTimer();
    this.manualDisconnectRequested = true;
    await this.disconnect({ silent: true, preserveIp: true });
    this.manualDisconnectRequested = false;
    this.robotIp = ip;

    const wsUrl = toWebSocketUrl(ip, this.options.wsPath);
    this.store.addLog('info', `正在连接机器人 ${ip}`);

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.terminate();
          reject(new Error('连接机器人超时'));
        }
      }, 5000);

      socket.on('open', () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        this.robotSocket = socket;
        this.bindSocketEvents(socket);
        this.store.updateRobot({
          ip,
          connected: true,
          mode: 'idle',
          lastSeenAt: new Date().toISOString()
        });
        if (this.reconnectAttempts > 0) {
          this.store.addLog('success', `机器人 ${ip} 自动重连成功`);
        }
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.store.addLog('success', `机器人 ${ip} 已连接`);
        this.sendCommand({ type: 'status_request' }).catch(() => {});
        this.emit('connected', { ip });
        resolve();
      });

      socket.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
    });

    return this.store.snapshot().robot;
  }

  bindSocketEvents(socket) {
    socket.on('message', (buffer) => {
      const rawText = buffer.toString();

      try {
        const payload = JSON.parse(rawText);

        if (payload.type === 'status') {
          this.heartbeatFailures = 0;
          this.store.applyRobotStatus({
            ...payload,
            ip: this.robotIp
          });
          return;
        }

        this.store.addLog('info', `收到机器人消息：${rawText}`);
      } catch {
        this.store.addLog('warn', `收到非 JSON 机器人消息：${rawText}`);
      }
    });

    socket.on('close', () => {
      const manual = this.manualDisconnectRequested;
      this.stopHeartbeat();
      this.robotSocket = null;
      this.store.updateRobot({
        connected: false,
        mode: manual ? 'disconnected' : 'reconnecting',
        latencyMs: null,
        signalStrength: null,
        battery: null,
        lastSeenAt: null,
        otaInProgress: false
      });
      this.store.resetRobotRuntimeState({
        resetScriptRunner: manual
      });
      this.store.addLog('warn', '机器人连接已断开');
      this.emit('disconnected', { ip: this.robotIp, manual });
      if (!manual) {
        this.scheduleReconnect();
      }
    });

    socket.on('error', (error) => {
      this.store.addLog('error', `机器人连接错误：${error.message}`);
    });
  }

  isConnected() {
    return this.robotSocket?.readyState === WebSocket.OPEN;
  }

  async disconnect({ silent = false, preserveIp = false } = {}) {
    this.stopHeartbeat();
    this.heartbeatFailures = 0;
    this.clearReconnectTimer();

    if (this.robotSocket) {
      const socket = this.robotSocket;
      this.robotSocket = null;
      socket.removeAllListeners();
      socket.close();
    }

    if (!preserveIp) {
      this.robotIp = '';
    }

    if (!silent) {
      this.store.addLog('info', '已主动断开机器人连接');
    }

    this.store.updateRobot({
      connected: false,
      mode: 'disconnected',
      latencyMs: null,
      signalStrength: null,
      battery: null,
      lastSeenAt: null,
      otaInProgress: false
    });
    this.store.resetRobotRuntimeState();
    this.emit('disconnected', { ip: this.robotIp, manual: true });
  }

  waitForReconnect({ timeoutMs = 60000 } = {}) {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    if (!this.robotIp || this.manualDisconnectRequested) {
      return Promise.reject(new Error('机器人尚未连接'));
    }

    this.scheduleReconnect();
    this.store.addLog('warn', `控制指令等待机器人重连，最多等待 ${Math.round(timeoutMs / 1000)} 秒`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('等待机器人重连超时'));
      }, timeoutMs);

      const onConnected = () => {
        cleanup();
        resolve();
      };

      const onDisconnected = ({ manual } = {}) => {
        if (!manual) {
          return;
        }

        cleanup();
        reject(new Error('机器人已主动断开'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off('connected', onConnected);
        this.off('disconnected', onDisconnected);
      };

      this.on('connected', onConnected);
      this.on('disconnected', onDisconnected);
    });
  }

  async sendCommand(command, options = {}) {
    if (!this.isConnected()) {
      if (!options.waitForReconnect) {
        throw new Error('机器人尚未连接');
      }

      await this.waitForReconnect({
        timeoutMs: options.reconnectTimeoutMs
      });
    }

    const encoded = JSON.stringify(command);
    await new Promise((resolve, reject) => {
      this.robotSocket.send(encoded, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    if (command.type === 'servo' && typeof command.id !== 'undefined') {
      this.store.updateServo(command.id, command.angle);
    }

    if (command.type === 'action' && command.name) {
      this.store.updateRobot({ mode: command.name });
    }

    if (command.type === 'move' && command.direction) {
      this.store.updateRobot({ mode: command.direction });
    }

    if (command.type === 'emergency_stop') {
      this.store.updateRobot({ mode: 'emergency_stop' });
    }

    if (command.type === 'gait_trial_start') {
      this.store.updateRobot({ mode: 'gait_trial' });
    }

    if (command.type === 'gait_trial_stop') {
      this.store.updateRobot({ mode: 'idle' });
    }

    this.store.addLog('info', `已发送控制指令：${encoded}`);
  }

  async fetchStatus() {
    if (!this.robotIp) {
      return null;
    }

    const startedAt = Date.now();
    const response = await fetch(joinUrl(this.robotIp, this.options.statusPath), {
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      throw new Error(`状态请求失败：${response.status}`);
    }

    const payload = await response.json();
    const latencyMs = Date.now() - startedAt;
    this.heartbeatFailures = 0;
    this.store.applyRobotStatus({
      ...payload,
      latencyMs,
      ip: this.robotIp
    });
    return payload;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.fetchStatus().catch((error) => {
        this.heartbeatFailures += 1;
        this.store.addLog('warn', `状态轮询失败：${error.message}`);
        if (this.heartbeatFailures >= this.options.maxHeartbeatFailures) {
          this.store.addLog('warn', '状态轮询连续失败，准备自动重连机器人');
          if (this.robotSocket) {
            this.robotSocket.terminate();
          } else {
            this.scheduleReconnect();
          }
        }
      });
    }, this.options.pingIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  scheduleReconnect() {
    if (!this.robotIp || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(this.options.reconnectDelayMs * this.reconnectAttempts, 5000);
    this.store.addLog('warn', `将在 ${delayMs}ms 后尝试重连机器人（第 ${this.reconnectAttempts} 次）`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.robotIp).catch((error) => {
        this.store.addLog('warn', `自动重连失败：${error.message}`);
        this.scheduleReconnect();
      });
    }, delayMs);
  }
}
