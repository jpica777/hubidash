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

/** A single attribute that changed between two polls of an already-known device. */
export interface AttributeChange {
  deviceId: string;
  deviceName: string;
  attribute: string;
  value: AttributeValue;
  previous: AttributeValue;
}

/* ------------------------------------------------------------------ */
/* Rule Machine                                                        */
/* ------------------------------------------------------------------ */

export interface RuleSummary {
  id: string;
  name: string;
  paused: boolean;
}

/* ------------------------------------------------------------------ */
/* Native automations                                                  */
/* ------------------------------------------------------------------ */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AutomationTrigger {
  type: 'device_state' | 'schedule' | 'time_of_day';
  // device_state
  deviceId?: string;
  attribute?: string;
  value?: string;
  // schedule
  cron?: string;
  // time_of_day
  time?: string;
  days?: DayOfWeek[];
}

export type ConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'after' | 'before';

/**
 * AND'd condition. `type` defaults to "device".
 * - device: compare a device attribute (equals / not_equals / greater_than / less_than)
 * - time:   local time is after/before HH:MM (window ends/starts at midnight)
 * - sun:    value "dark" (between sunset and sunrise) or "light"; requires LATITUDE/LONGITUDE
 */
export interface AutomationCondition {
  type?: 'device' | 'time' | 'sun';
  deviceId?: string;
  attribute?: string;
  operator: ConditionOperator;
  value: string;
}

export interface AutomationAction {
  type: 'device_command' | 'delay';
  deviceId?: string;
  command?: string;
  value?: string | number;
  seconds?: number;
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export type AutomationInput = Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>;

export interface AutomationActionResult {
  description: string;
  success: boolean;
  error?: string;
}

export interface AutomationLog {
  id: string;
  automationId: string;
  automationName: string;
  triggeredAt: string;
  triggerReason: string;
  actions: AutomationActionResult[];
}

export interface AutomationMeta {
  timezone: string;
  sunConditionsAvailable: boolean;
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
  | { type: 'automation'; log: AutomationLog }
  | { type: 'pong' };

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    wsToken?: string;
  }
}
