import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Store, SessionData } from 'express-session';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { DeviceCache } from './deviceCache.js';
import type { HubitatClient } from './hubitat.js';
import { CommandError, executeCommand, parseCommandInput } from './commands.js';
import type { ClientMessage, ServerMessage } from '../types/index.js';

const WS_PATH = '/ws';
const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 30_000;

/** Custom close codes understood by the client. */
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_AUTH_TIMEOUT = 4408;

interface ClientState {
  authed: boolean;
  token: string | null;
  alive: boolean;
  authTimer: NodeJS.Timeout | null;
}

interface WsManagerDeps {
  sessionStore: Store;
  cache: DeviceCache;
  client: HubitatClient;
}

type SessionMap = Record<string, SessionData> | SessionData[] | null | undefined;

export class WsManager {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  private readonly clients = new Map<WebSocket, ClientState>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly deps: WsManagerDeps) {
    this.wss.on('connection', (ws) => this.onConnection(ws));

    deps.cache.on('changes', (changes) => {
      this.broadcast({
        type: 'update',
        devices: changes.changed,
        removed: changes.removed,
        stale: changes.stale,
        lastUpdated: changes.lastUpdated,
      });
    });
    deps.cache.on('status', (status) => {
      this.broadcast({ type: 'status', ...status });
    });
  }

  /** Attaches to the HTTP server's upgrade event, accepting only the /ws path. */
  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname: string;
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        pathname = '';
      }
      if (pathname !== WS_PATH) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });

    this.heartbeat = setInterval(() => void this.runHeartbeat(), HEARTBEAT_MS);
  }

  /** Closes every socket authenticated with the given token (called on logout). */
  revokeToken(token: string): void {
    for (const [ws, state] of this.clients) {
      if (state.token === token) ws.close(WS_CLOSE_UNAUTHORIZED, 'Logged out');
    }
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const ws of this.clients.keys()) ws.close(1001, 'Server shutting down');
    this.wss.close();
    this.deps.cache.stopPolling();
  }

  private onConnection(ws: WebSocket): void {
    const state: ClientState = {
      authed: false,
      token: null,
      alive: true,
      authTimer: setTimeout(() => ws.close(WS_CLOSE_AUTH_TIMEOUT, 'Authentication timeout'), AUTH_TIMEOUT_MS),
    };
    this.clients.set(ws, state);

    ws.on('pong', () => {
      state.alive = true;
    });
    ws.on('message', (data) => void this.onMessage(ws, state, data));
    ws.on('close', () => {
      if (state.authTimer) clearTimeout(state.authTimer);
      this.clients.delete(ws);
      this.updatePolling();
    });
    ws.on('error', (err) => {
      console.warn('[ws] socket error:', err.message);
    });
  }

  private async onMessage(ws: WebSocket, state: ClientState, data: RawData): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      this.send(ws, { type: 'error', error: 'Malformed message' });
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      this.send(ws, { type: 'error', error: 'Malformed message' });
      return;
    }

    if (!state.authed) {
      if (msg.type !== 'auth' || typeof msg.token !== 'string') {
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Authentication required');
        return;
      }
      await this.authenticate(ws, state, msg.token);
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        return;
      case 'command':
        await this.handleCommand(ws, msg);
        return;
      default:
        this.send(ws, { type: 'error', error: 'Unknown message type' });
    }
  }

  private async authenticate(ws: WebSocket, state: ClientState, token: string): Promise<void> {
    const valid = await this.isTokenValid(token);
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!valid) {
      ws.close(WS_CLOSE_UNAUTHORIZED, 'Invalid token');
      return;
    }

    if (state.authTimer) clearTimeout(state.authTimer);
    state.authTimer = null;
    state.authed = true;
    state.token = token;
    this.send(ws, { type: 'auth_ok', mode: this.deps.client.mode });

    this.updatePolling();
    if (!this.deps.cache.hasData) await this.deps.cache.refresh();
    this.send(ws, { type: 'snapshot', ...this.deps.cache.snapshot() });
  }

  private async handleCommand(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: 'command' }>,
  ): Promise<void> {
    const requestId = typeof msg.requestId === 'string' ? msg.requestId.slice(0, 64) : '';
    try {
      const input = parseCommandInput(msg.deviceId, msg.command, msg.value);
      await executeCommand(this.deps.client, this.deps.cache, input);
      this.send(ws, { type: 'commandResult', requestId, ok: true });
    } catch (err) {
      const error = err instanceof CommandError ? err.message : 'Command failed';
      if (!(err instanceof CommandError)) console.error('[ws] command error:', err);
      this.send(ws, { type: 'commandResult', requestId, ok: false, error });
    }
  }

  /** A token is valid only while an unexpired, authenticated session carries it. */
  private isTokenValid(token: string): Promise<boolean> {
    return new Promise((resolve) => {
      const all = this.deps.sessionStore.all;
      if (!all) {
        resolve(false);
        return;
      }
      all.call(this.deps.sessionStore, (err: unknown, sessions: SessionMap) => {
        if (err || !sessions) {
          resolve(false);
          return;
        }
        const list = Array.isArray(sessions) ? sessions : Object.values(sessions);
        resolve(list.some((s) => s?.authenticated === true && s.wsToken === token));
      });
    });
  }

  private async runHeartbeat(): Promise<void> {
    for (const [ws, state] of this.clients) {
      if (!state.alive) {
        ws.terminate();
        continue;
      }
      state.alive = false;
      ws.ping();
      // Drop sockets whose session has expired or been destroyed.
      if (state.authed && state.token && !(await this.isTokenValid(state.token))) {
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Session expired');
      }
    }
  }

  private updatePolling(): void {
    const hasLiveClients = [...this.clients.values()].some((s) => s.authed);
    if (hasLiveClients) this.deps.cache.startPolling();
    else this.deps.cache.stopPolling();
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const [ws, state] of this.clients) {
      if (state.authed && ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
