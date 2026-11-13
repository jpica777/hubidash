export type HubitatMode = 'local' | 'cloud';

export type AttributeValue = string | number | boolean | null;

/** Normalized device shape shared with the client. */
export interface Device {
  id: string;
  name: string;
  label: string;
  type: string;
  room: string | null;
  capabilities: string[];
  attributes: Record<string, AttributeValue>;
  commands: string[];
}

export interface DeviceSnapshot {
  devices: Device[];
  stale: boolean;
  lastUpdated: string | null;
  mode: HubitatMode;
}

export interface CacheStatus {
  stale: boolean;
  lastUpdated: string | null;
}

export interface DeviceChanges extends CacheStatus {
  changed: Device[];
  removed: string[];
}

export interface CommandInput {
  deviceId: string;
  command: string;
  value?: string | number;
}

/** Messages sent from browser to server over the WebSocket. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; requestId: string; deviceId: string; command: string; value?: string | number }
  | { type: 'ping' };

/** Messages sent from server to browser over the WebSocket. */
export type ServerMessage =
  | { type: 'auth_ok'; mode: HubitatMode }
  | ({ type: 'snapshot' } & DeviceSnapshot)
  | ({ type: 'update'; devices: Device[]; removed: string[] } & CacheStatus)
  | ({ type: 'status' } & CacheStatus)
  | { type: 'commandResult'; requestId: string; ok: boolean; error?: string }
  | { type: 'error'; error: string }
  | { type: 'pong' };

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    wsToken?: string;
  }
}
