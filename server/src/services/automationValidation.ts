import cron from 'node-cron';
import { CommandError, isValidDeviceId, parseCommandInput } from './commands.js';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationInput,
  AutomationTrigger,
  ConditionOperator,
  DayOfWeek,
} from '../types/index.js';

export class AutomationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationValidationError';
  }
}

export const DAYS_OF_WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ATTRIBUTE_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_NAME = 100;
const MAX_VALUE = 100;
const MAX_CONDITIONS = 10;
const MAX_ACTIONS = 25;
const MAX_DELAY_SECONDS = 3_600;
const DEVICE_OPERATORS: ConditionOperator[] = ['equals', 'not_equals', 'greater_than', 'less_than'];

function fail(message: string): never {
  throw new AutomationValidationError(message);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, max = MAX_VALUE): string {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !text.trim()) fail(`${field} is required`);
  if (text.trim().length > max) fail(`${field} must be at most ${max} characters`);
  return text.trim();
}

function requireDeviceId(value: unknown, field: string): string {
  const id = typeof value === 'number' ? String(value) : value;
  if (!isValidDeviceId(id)) fail(`${field}: choose a device`);
  return id;
}

function requireAttribute(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ATTRIBUTE_RE.test(value)) fail(`${field}: choose an attribute`);
  return value;
}

function isNumeric(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text));
}

function validateTrigger(raw: unknown): AutomationTrigger {
  const t = asRecord(raw, 'Trigger');
  switch (t.type) {
    case 'device_state':
      return {
        type: 'device_state',
        deviceId: requireDeviceId(t.deviceId, 'Trigger'),
        attribute: requireAttribute(t.attribute, 'Trigger'),
        value: requireString(t.value, 'Trigger value'),
      };
    case 'schedule': {
      const expr = requireString(t.cron, 'Cron expression').replace(/\s+/g, ' ');
      if (expr.split(' ').length !== 5 || !cron.validate(expr)) {
        fail('Cron expression must have 5 valid fields: minute hour day-of-month month day-of-week');
      }
      return { type: 'schedule', cron: expr };
    }
    case 'time_of_day': {
      const time = requireString(t.time, 'Time');
      if (!TIME_RE.test(time)) fail('Time must be HH:MM in 24-hour format');
      let days: DayOfWeek[] = [...DAYS_OF_WEEK];
      if (t.days !== undefined) {
        if (!Array.isArray(t.days)) fail('Days must be a list');
        const set = new Set<DayOfWeek>();
        for (const day of t.days) {
          if (typeof day !== 'string' || !DAYS_OF_WEEK.includes(day as DayOfWeek)) fail(`Invalid day "${String(day)}"`);
          set.add(day as DayOfWeek);
        }
        if (set.size === 0) fail('Pick at least one day');
        days = DAYS_OF_WEEK.filter((d) => set.has(d));
      }
      return { type: 'time_of_day', time, days };
    }
    default:
      return fail('Choose a trigger type');
  }
}

function validateCondition(raw: unknown, index: number, sunAvailable: boolean): AutomationCondition {
  const c = asRecord(raw, `Condition ${index + 1}`);
  const label = `Condition ${index + 1}`;
  const type = c.type ?? 'device';

  if (type === 'device') {
    const operator = c.operator as ConditionOperator;
    if (!DEVICE_OPERATORS.includes(operator)) fail(`${label}: choose a comparison`);
    const value = requireString(c.value, `${label} value`);
    if ((operator === 'greater_than' || operator === 'less_than') && !isNumeric(value)) {
      fail(`${label}: "greater than" / "less than" need a number`);
    }
    return {
      type: 'device',
      deviceId: requireDeviceId(c.deviceId, label),
      attribute: requireAttribute(c.attribute, label),
      operator,
      value,
    };
  }
  if (type === 'time') {
    if (c.operator !== 'after' && c.operator !== 'before') fail(`${label}: choose after or before`);
    const value = requireString(c.value, `${label} time`);
    if (!TIME_RE.test(value)) fail(`${label}: time must be HH:MM`);
    return { type: 'time', operator: c.operator, value };
  }
  if (type === 'sun') {
    if (!sunAvailable) fail(`${label}: sunrise/sunset conditions need LATITUDE and LONGITUDE configured on the server`);
    if (c.value !== 'dark' && c.value !== 'light') fail(`${label}: choose dark or light`);
    return { type: 'sun', operator: 'equals', value: c.value };
  }
  return fail(`${label}: unknown condition type`);
}

function validateAction(raw: unknown, index: number): AutomationAction {
  const a = asRecord(raw, `Action ${index + 1}`);
  const label = `Action ${index + 1}`;

  if (a.type === 'delay') {
    const seconds = typeof a.seconds === 'string' ? Number(a.seconds) : a.seconds;
    if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_DELAY_SECONDS) {
      fail(`${label}: wait must be a whole number of seconds between 1 and ${MAX_DELAY_SECONDS}`);
    }
    return { type: 'delay', seconds };
  }
  if (a.type === 'device_command') {
    const deviceId = requireDeviceId(a.deviceId, label);
    if (typeof a.command !== 'string' || !a.command) fail(`${label}: choose a command`);
    try {
      const input = parseCommandInput(deviceId, a.command, a.value);
      return input.value === undefined
        ? { type: 'device_command', deviceId, command: input.command }
        : { type: 'device_command', deviceId, command: input.command, value: input.value };
    } catch (err) {
      if (err instanceof CommandError) fail(`${label}: ${err.message.toLowerCase()}`);
      throw err;
    }
  }
  return fail(`${label}: choose an action type`);
}

/** Validates an untrusted automation body. `enabled` is returned as-is (undefined if absent). */
export function validateAutomationInput(
  body: unknown,
  options: { sunAvailable: boolean },
): Omit<AutomationInput, 'enabled'> & { enabled?: boolean } {
  const r = asRecord(body, 'Automation');
  const name = requireString(r.name, 'Name', MAX_NAME);

  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') fail('enabled must be true or false');

  const trigger = validateTrigger(r.trigger);

  let conditions: AutomationCondition[] | undefined;
  if (r.conditions !== undefined && r.conditions !== null) {
    if (!Array.isArray(r.conditions)) fail('Conditions must be a list');
    if (r.conditions.length > MAX_CONDITIONS) fail(`At most ${MAX_CONDITIONS} conditions`);
    conditions = r.conditions.map((c, i) => validateCondition(c, i, options.sunAvailable));
    if (conditions.length === 0) conditions = undefined;
  }

  if (!Array.isArray(r.actions) || r.actions.length === 0) fail('Add at least one action');
  if (r.actions.length > MAX_ACTIONS) fail(`At most ${MAX_ACTIONS} actions`);
  const actions = r.actions.map((a, i) => validateAction(a, i));
  if (!actions.some((a) => a.type === 'device_command')) fail('Add at least one device action (waits alone do nothing)');

  return {
    name,
    ...(typeof r.enabled === 'boolean' ? { enabled: r.enabled } : {}),
    trigger,
    ...(conditions ? { conditions } : {}),
    actions,
  };
}
