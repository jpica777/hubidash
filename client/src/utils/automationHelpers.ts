import type {
  Automation,
  AutomationAction,
  AutomationCondition,
  AutomationDraft,
  AutomationTrigger,
  DayOfWeek,
  Device,
} from '../types/devices';
import { displayName } from './deviceHelpers';

export const DAYS: Array<{ id: DayOfWeek; short: string }> = [
  { id: 'mon', short: 'Mon' },
  { id: 'tue', short: 'Tue' },
  { id: 'wed', short: 'Wed' },
  { id: 'thu', short: 'Thu' },
  { id: 'fri', short: 'Fri' },
  { id: 'sat', short: 'Sat' },
  { id: 'sun', short: 'Sun' },
];
const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND: DayOfWeek[] = ['sat', 'sun'];

/** Well-known attribute values offered as a dropdown in pickers. */
export const ATTRIBUTE_VALUES: Record<string, string[]> = {
  switch: ['on', 'off'],
  water: ['wet', 'dry'],
  motion: ['active', 'inactive'],
  contact: ['open', 'closed'],
  lock: ['locked', 'unlocked'],
  presence: ['present', 'not present'],
  smoke: ['detected', 'clear'],
  carbonMonoxide: ['detected', 'clear'],
  acceleration: ['active', 'inactive'],
  door: ['open', 'closed', 'opening', 'closing'],
  thermostatMode: ['off', 'heat', 'cool', 'auto', 'emergency heat'],
  thermostatOperatingState: ['idle', 'heating', 'cooling', 'fan only'],
  pushed: ['1', '2', '3', '4'],
};

const PREFERRED_ATTRIBUTES = ['switch', 'water', 'motion', 'contact', 'lock', 'presence', 'temperature', 'humidity', 'battery', 'level'];

/** Attributes for pickers, most useful first. */
export function deviceAttributes(device: Device | undefined): string[] {
  if (!device) return [];
  const keys = Object.keys(device.attributes).filter((k) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k));
  return [
    ...PREFERRED_ATTRIBUTES.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !PREFERRED_ATTRIBUTES.includes(k)).sort(),
  ];
}

/** Commands that are commonly sent with a value. */
export function commandTakesValue(command: string | undefined): boolean {
  if (!command) return false;
  return /^set[A-Z]/.test(command) || ['deviceNotification', 'speak', 'playText', 'push', 'hold', 'release', 'doubleTap'].includes(command);
}

export function formatClock(time: string | undefined): string {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return time ?? '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function describeDays(days: DayOfWeek[] | undefined): string {
  const set = new Set(days && days.length ? days : DAYS.map((d) => d.id));
  if (set.size === 7) return 'every day';
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return 'weekdays';
  if (set.size === 2 && WEEKEND.every((d) => set.has(d))) return 'weekends';
  return DAYS.filter((d) => set.has(d.id))
    .map((d) => d.short)
    .join(', ');
}

/* --------------------------------- cron --------------------------------- */

export type CronPreset = 'hourly' | 'daily' | 'weekdays' | 'custom';

export interface ParsedCron {
  preset: CronPreset;
  time: string; // HH:MM for daily/weekdays
}

export function parseCron(expr: string | undefined): ParsedCron {
  const e = (expr ?? '').trim().replace(/\s+/g, ' ');
  if (e === '0 * * * *') return { preset: 'hourly', time: '08:00' };
  const m = e.match(/^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5)$/);
  if (m) {
    const minute = Number(m[1]);
    const hour = Number(m[2]);
    if (minute < 60 && hour < 24) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      return { preset: m[3] === '*' ? 'daily' : 'weekdays', time };
    }
  }
  return { preset: 'custom', time: '08:00' };
}

export function buildCron(preset: Exclude<CronPreset, 'custom'>, time: string): string {
  if (preset === 'hourly') return '0 * * * *';
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * ${preset === 'weekdays' ? '1-5' : '*'}`;
}

export function describeCron(expr: string | undefined): string {
  const parsed = parseCron(expr);
  switch (parsed.preset) {
    case 'hourly':
      return 'Every hour';
    case 'daily':
      return `Daily at ${formatClock(parsed.time)}`;
    case 'weekdays':
      return `Weekdays at ${formatClock(parsed.time)}`;
    default:
      return `Cron ${expr ?? ''}`;
  }
}

/* ------------------------------- summaries ------------------------------ */

type NameLookup = (deviceId: string | undefined) => string;

export function makeNameLookup(devices: Device[]): NameLookup {
  const map = new Map(devices.map((d) => [d.id, displayName(d)]));
  return (id) => (id ? (map.get(id) ?? `Device ${id}`) : 'a device');
}

export function describeTrigger(trigger: AutomationTrigger, nameOf: NameLookup): string {
  switch (trigger.type) {
    case 'device_state':
      return `When ${nameOf(trigger.deviceId)} ${trigger.attribute} becomes ${trigger.value}`;
    case 'schedule':
      return describeCron(trigger.cron);
    case 'time_of_day':
      return `At ${formatClock(trigger.time)}, ${describeDays(trigger.days)}`;
    default:
      return 'Unknown trigger';
  }
}

const OPERATOR_TEXT: Record<string, string> = {
  equals: 'is',
  not_equals: 'is not',
  greater_than: 'is above',
  less_than: 'is below',
};

export function describeCondition(condition: AutomationCondition, nameOf: NameLookup): string {
  const type = condition.type ?? 'device';
  if (type === 'time') return `time is ${condition.operator} ${formatClock(condition.value)}`;
  if (type === 'sun') return `it's ${condition.value === 'dark' ? 'dark (after sunset)' : 'light (after sunrise)'}`;
  return `${nameOf(condition.deviceId)} ${condition.attribute} ${OPERATOR_TEXT[condition.operator] ?? condition.operator} ${condition.value}`;
}

export function describeAction(action: AutomationAction, nameOf: NameLookup): string {
  if (action.type === 'delay') return `wait ${action.seconds}s`;
  const name = nameOf(action.deviceId);
  switch (action.command) {
    case 'on':
      return `turn on ${name}`;
    case 'off':
      return `turn off ${name}`;
    case 'lock':
      return `lock ${name}`;
    case 'unlock':
      return `unlock ${name}`;
    case 'setLevel':
      return `set ${name} to ${action.value}%`;
    default:
      return action.value !== undefined && action.value !== ''
        ? `${name}: ${action.command}(${action.value})`
        : `${name}: ${action.command}`;
  }
}

export function describeActions(actions: AutomationAction[], nameOf: NameLookup): string {
  const text = actions.map((a) => describeAction(a, nameOf)).join(', then ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* --------------------------------- drafts -------------------------------- */

export function emptyDraft(): AutomationDraft {
  return {
    name: '',
    enabled: true,
    trigger: { type: 'device_state', deviceId: '', attribute: '', value: '' },
    conditions: [],
    actions: [{ type: 'device_command', deviceId: '', command: '' }],
  };
}

export function automationToDraft(a: Automation): AutomationDraft {
  return {
    name: a.name,
    enabled: a.enabled,
    trigger: { ...a.trigger, days: a.trigger.days ? [...a.trigger.days] : undefined },
    conditions: (a.conditions ?? []).map((c) => ({ ...c })),
    actions: a.actions.map((x) => ({ ...x })),
  };
}

/** Removes empty optional values and fields belonging to other trigger types before sending. */
export function cleanDraft(draft: AutomationDraft): AutomationDraft {
  const t = draft.trigger;
  const trigger: AutomationTrigger =
    t.type === 'device_state'
      ? { type: t.type, deviceId: t.deviceId, attribute: t.attribute, value: t.value }
      : t.type === 'schedule'
        ? { type: t.type, cron: t.cron }
        : { type: t.type, time: t.time, days: t.days };
  return {
    name: draft.name.trim(),
    enabled: draft.enabled,
    trigger,
    conditions: draft.conditions?.length ? draft.conditions : undefined,
    actions: draft.actions.map((a) =>
      a.type === 'delay'
        ? { type: 'delay', seconds: Number(a.seconds) }
        : {
            type: 'device_command',
            deviceId: a.deviceId,
            command: a.command,
            ...(a.value !== undefined && String(a.value).trim() !== '' ? { value: String(a.value).trim() } : {}),
          },
    ),
  };
}

/** Client-side checks before save/test; the server validates again. */
export function validateDraft(draft: AutomationDraft): string | null {
  if (!draft.name.trim()) return 'Give the automation a name';
  const t = draft.trigger;
  if (t.type === 'device_state' && (!t.deviceId || !t.attribute || !t.value?.trim())) {
    return 'Trigger: choose a device, attribute and value';
  }
  if (t.type === 'schedule' && (t.cron ?? '').trim().split(/\s+/).length !== 5) {
    return 'Schedule: cron needs 5 fields (minute hour day month weekday)';
  }
  if (t.type === 'time_of_day') {
    if (!t.time) return 'Trigger: choose a time';
    if (!t.days || t.days.length === 0) return 'Trigger: pick at least one day';
  }
  for (const [i, c] of (draft.conditions ?? []).entries()) {
    const type = c.type ?? 'device';
    if (type === 'device' && (!c.deviceId || !c.attribute || !c.value.trim())) {
      return `Condition ${i + 1}: choose a device, attribute and value`;
    }
    if (type === 'time' && !c.value) return `Condition ${i + 1}: choose a time`;
  }
  if (draft.actions.length === 0) return 'Add at least one action';
  for (const [i, a] of draft.actions.entries()) {
    if (a.type === 'device_command' && (!a.deviceId || !a.command)) return `Action ${i + 1}: choose a device and command`;
    if (a.type === 'delay' && (!Number.isInteger(Number(a.seconds)) || Number(a.seconds) < 1)) {
      return `Action ${i + 1}: wait must be at least 1 second`;
    }
  }
  if (!draft.actions.some((a) => a.type === 'device_command')) return 'Add at least one device action';
  return null;
}
