import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { WsIncomingMessage, WsOutgoingMessage, DeviceUpdate } from '../types/index';
import { deviceCache } from './deviceCache';
import { hubitatClient } from './hubitat';

interface AuthenticatedClient {
  ws: WebSocket;
  authenticated: boolean;
}

const validWsTokens = new Map<string, number>(); // token → expiresAt

export function registerWsToken(token: string) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  validWsTokens.set(token, expiresAt);
}

export function revokeWsToken(token: string) {
  validWsTokens.delete(token);
}

function isValidToken(token: string): boolean {
  const expiresAt = validWsTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    validWsTokens.delete(token);
    return false;
  }
  return true;
}

function send(ws: WebSocket, msg: WsOutgoingMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

class WsManager {
  private clients: Set<AuthenticatedClient> = new Set();

  initialize() {
    // Listen for device changes from the poll cycle
    deviceCache.addChangeListener((updates: DeviceUpdate[]) => {
      this.broadcastUpdates(updates);
    });
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage) {
    const client: AuthenticatedClient = { ws, authenticated: false };
    this.clients.add(client);

    const authTimeout = setTimeout(() => {
      if (!client.authenticated) {
        send(ws, { type: 'error', payload: 'Authentication timeout' });
        ws.close(1008, 'Authentication timeout');
      }
    }, 10_000);

    ws.on('message', async (data) => {
      let msg: WsIncomingMessage;
      try {
        msg = JSON.parse(data.toString()) as WsIncomingMessage;
      } catch {
        send(ws, { type: 'error', payload: 'Invalid JSON' });
        return;
      }

      if (msg.type === 'auth') {
        if (!msg.token || !isValidToken(msg.token)) {
          send(ws, { type: 'error', payload: 'Invalid or expired token' });
          ws.close(1008, 'Unauthorized');
          return;
        }
        client.authenticated = true;
        clearTimeout(authTimeout);
        send(ws, { type: 'authOk' });

        // Send full current state immediately after auth
        const state = deviceCache.getCachedState();
        send(ws, { type: 'fullState', payload: state });
        return;
      }

      if (!client.authenticated) {
        send(ws, { type: 'error', payload: 'Not authenticated' });
        return;
      }

      if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'command' && msg.payload) {
        const { deviceId, command, value } = msg.payload;
        try {
          await hubitatClient.sendCommand(deviceId, command, value);
        } catch (err) {
          send(ws, {
            type: 'error',
            payload: `Command failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.clients.delete(client);
    });

    ws.on('error', (err) => {
      console.error('[WsManager] Client error:', err.message);
      this.clients.delete(client);
    });
  }

  private broadcastUpdates(updates: DeviceUpdate[]) {
    const msg: WsOutgoingMessage = { type: 'deviceUpdates', payload: updates };
    const json = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(json);
      }
    }
  }

  broadcastFullState() {
    const state = deviceCache.getCachedState();
    const msg: WsOutgoingMessage = { type: 'fullState', payload: state };
    const json = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(json);
      }
    }
  }

  getConnectedCount(): number {
    return Array.from(this.clients).filter((c) => c.authenticated).length;
  }
}

export const wsManager = new WsManager();
