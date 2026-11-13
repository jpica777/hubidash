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
  | { type: 'automation'; log: AutomationLog }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'command'; requestId: string; deviceId: string; command: string; value?: string | number }
  | { type: 'ping' };

/* ------------------------------------------------------------------ */
/* Rule Machine                                                        */
/* ------------------------------------------------------------------ */

export interface RuleSummary {
  id: string;
  name: string;
  paused: boolean;
}

export type RuleAction = 'run' | 'evaluate' | 'pause' | 'resume';

/* ------------------------------------------------------------------ */
/* Native automations                                                  */
/* ------------------------------------------------------------------ */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AutomationTrigger {
  type: 'device_state' | 'schedule' | 'time_of_day';
  deviceId?: string;
  attribute?: string;
  value?: string;
  cron?: string;
  time?: string;
  days?: DayOfWeek[];
}

export type ConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'after' | 'before';

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

export type AutomationDraft = Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>;

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

/** Device categories plus the two non-device views. */
export type DashboardView = CategoryFilter | 'automations' | 'rules';
