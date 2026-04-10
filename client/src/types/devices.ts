export interface Device {
  id: string;
  name: string;
  label: string;
  type: string;
  capabilities: string[];
  attributes: Record<string, string | number | boolean | null>;
  commands: string[];
  stale?: boolean;
}

export interface DeviceUpdate {
  id: string;
  attributes: Record<string, string | number | boolean | null>;
}

export interface CachedDeviceState {
  devices: Device[];
  lastUpdated: number;
  stale: boolean;
}

export type DeviceCategory = 'all' | 'lights' | 'sensors' | 'locks' | 'climate' | 'other';

export interface CommandRequest {
  command: string;
  value?: string | number;
}

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// Messages sent TO the server over WS
export type WsOutgoing =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  | { type: 'command'; payload: { deviceId: string; command: string; value?: string | number } };

// Messages received FROM the server over WS
export type WsIncoming =
  | { type: 'authOk' }
  | { type: 'pong' }
  | { type: 'error'; payload: string }
  | { type: 'fullState'; payload: CachedDeviceState }
  | { type: 'deviceUpdates'; payload: DeviceUpdate[] };
