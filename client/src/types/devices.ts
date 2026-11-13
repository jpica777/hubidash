export type HubitatMode = 'local' | 'cloud';

export type AttributeValue = string | number | boolean | null;

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

export type DeviceKind =
  | 'switch'
  | 'dimmer'
  | 'color'
  | 'lock'
  | 'thermostat'
  | 'water'
  | 'contact'
  | 'motion'
  | 'temperature'
  | 'sensor'
  | 'other';

export type DeviceCategory = 'lights' | 'sensors' | 'locks' | 'climate' | 'other';

export type CategoryFilter = 'all' | DeviceCategory;

export type StatusTone = 'active' | 'neutral' | 'alert';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'disconnected';

export interface DeviceAlert {
  deviceId: string;
  deviceName: string;
  kind: 'water' | 'battery' | 'smoke' | 'co' | 'unlocked';
  message: string;
  /** Whether this alert belongs in the sticky top banner (critical) or only on the card. */
  banner: boolean;
}

export interface DeviceReading {
  key: string;
  label: string;
  value: string;
}

export type CommandFn = (
  deviceId: string,
  command: string,
  value?: string | number,
  optimistic?: Record<string, AttributeValue>,
) => Promise<boolean>;

export interface DeviceSnapshot {
  devices: Device[];
  stale: boolean;
  lastUpdated: string | null;
  mode: HubitatMode;
}

export type ServerMessage =
  | { type: 'auth_ok'; mode: HubitatMode }
  | ({ type: 'snapshot' } & DeviceSnapshot)
  | { type: 'update'; devices: Device[]; removed: string[]; stale: boolean; lastUpdated: string | null }
  | { type: 'status'; stale: boolean; lastUpdated: string | null }
  | { type: 'commandResult'; requestId: string; ok: boolean; error?: string }
  | { type: 'error'; error: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; requestId: string; deviceId: string; command: string; value?: string | number }
  | { type: 'ping' };
