import 'express-session';

// Augment express-session types
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
    wsToken: string;
  }
}

export interface HubitatRawAttribute {
  name: string;
  currentValue: string | number | boolean | null;
  dataType: string;
}

export interface HubitatRawCommand {
  command: string;
  params?: Array<{ name: string; type: string }>;
}

export interface HubitatRawDevice {
  id: string;
  name: string;
  label: string;
  type: string;
  capabilities: string[];
  attributes: HubitatRawAttribute[];
  commands: HubitatRawCommand[];
}

export interface Device {
  id: string;
  name: string;
  label: string;
  type: string;
  capabilities: string[];
  attributes: Record<string, string | number | boolean | null>;
  commands: string[];
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

export interface WsIncomingMessage {
  type: 'auth' | 'ping' | 'command';
  token?: string;
  payload?: {
    deviceId: string;
    command: string;
    value?: string | number;
  };
}

export interface WsOutgoingMessage {
  type: 'authOk' | 'error' | 'deviceUpdates' | 'fullState' | 'pong';
  payload?: unknown;
}
