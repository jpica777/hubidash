import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import cron, { type ScheduledTask } from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceCache } from './deviceCache.js';
import type { HubitatClient } from './hubitat.js';
import { executeCommand } from './commands.js';
import { isDark } from './sunTimes.js';
import { AutomationValidationError, DAYS_OF_WEEK, validateAutomationInput } from './automationValidation.js';
import type {
  AttributeChange,
  AttributeValue,
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationCondition,
  AutomationLog,
  AutomationMeta,
  AutomationTrigger,
} from '../types/index.js';

export { AutomationValidationError };

export class AutomationNotFoundError extends Error {
  constructor(id: string) {
    super(`Automation ${id} not found`);
    this.name = 'AutomationNotFoundError';
  }
}

interface EngineDeps {
  client: HubitatClient;
  cache: DeviceCache;
  dataDir: string;
  timezone: string;
  location: { latitude: number; longitude: number } | null;
}

interface EngineEvents {
  executed: [AutomationLog];
}

const DEBOUNCE_MS = 5_000;
const LOG_CAPACITY = 100;
const CRON_DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Case-insensitive match; numeric values compare numerically ("50" matches 50.0). */
function valuesMatch(actual: AttributeValue | undefined, expected: string): boolean {
  if (actual === null || actual === undefined) return false;
  const a = String(actual).trim();
  const e = expected.trim();
  const na = Number(a);
  const ne = Number(e);
  if (a !== '' && e !== '' && Number.isFinite(na) && Number.isFinite(ne)) return na === ne;
  return a.toLowerCase() === e.toLowerCase();
}

function timeOfDayToCron(trigger: AutomationTrigger): string {
  const [hour, minute] = (trigger.time ?? '00:00').split(':').map(Number);
  const days = trigger.days && trigger.days.length > 0 ? trigger.days : DAYS_OF_WEEK;
  const dayField = days.length === 7 ? '*' : days.map((d) => CRON_DAY[d]).join(',');
  return `${minute} ${hour} * * ${dayField}`;
}

function minutesInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

/**
 * Runs HubiDash-native automations: device-state, cron and time-of-day triggers,
 * AND'd conditions, and sequential device-command / delay actions. Persists to
 * data/automations.json with atomic writes. Never throws out of trigger paths.
 */
export class AutomationEngine extends EventEmitter<EngineEvents> {
  private automations = new Map<string, Automation>();
  private readonly jobs = new Map<string, ScheduledTask>();
  private readonly lastRun = new Map<string, number>();
  private readonly running = new Set<string>();
  private readonly logs: AutomationLog[] = [];
  private mutationChain: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly deps: EngineDeps) {
    super();
    this.file = path.join(deps.dataDir, 'automations.json');
  }

  get meta(): AutomationMeta {
    return { timezone: this.deps.timezone, sunConditionsAvailable: this.deps.location !== null };
  }

  /* -------------------------------- lifecycle -------------------------------- */

  async init(): Promise<void> {
    this.deps.cache.on('attributeChanges', (changes) => this.checkTriggers(changes));

    try {
      await fs.mkdir(this.deps.dataDir, { recursive: true });
      const loaded = await this.load();
      this.automations = new Map(loaded.map((a) => [a.id, a]));
      console.log(`[automations] loaded ${loaded.length} automation(s) from ${this.file}`);
    } catch (err) {
      console.error(`[automations] could not load ${this.file}: ${errorMessage(err)} — starting empty`);
    }

    this.rebuildSchedules();
    this.updatePollingDemand();
  }

  stop(): void {
    for (const job of this.jobs.values()) void job.destroy();
    this.jobs.clear();
  }

  private async load(): Promise<Automation[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.persist([]);
        return [];
      }
      throw err;
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await fs.rename(this.file, backup);
      console.error(`[automations] ${this.file} was not valid JSON; moved to ${backup}`);
      await this.persist([]);
      return [];
    }
    if (!Array.isArray(data)) throw new Error('automations.json must contain an array');

    const result: Automation[] = [];
    for (const item of data) {
      try {
        const rec = item as Partial<Automation>;
        if (typeof rec.id !== 'string' || !rec.id) throw new Error('missing id');
        // Lenient on sun conditions so removing LATITUDE/LONGITUDE doesn't drop automations.
        const input = validateAutomationInput(item, { sunAvailable: true });
        const now = new Date().toISOString();
        result.push({
          id: rec.id,
          ...input,
          enabled: input.enabled ?? true,
          createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now,
          updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : now,
        });
      } catch (err) {
        console.warn(`[automations] skipping invalid stored automation: ${errorMessage(err)}`);
      }
    }
    return result;
  }

  /** Atomic write: temp file in the same directory, then rename over the original. */
  private async persist(list: Automation[]): Promise<void> {
    await fs.mkdir(this.deps.dataDir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    try {
      await fs.rename(tmp, this.file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  /** Serializes mutations; state only changes once the file write succeeds. */
  private commit<T>(mutate: (next: Map<string, Automation>) => T): Promise<T> {
    const run = async () => {
      const next = new Map(this.automations);
      const result = mutate(next);
      await this.persist([...next.values()]);
      this.automations = next;
      this.rebuildSchedules();
      this.updatePollingDemand();
      return result;
    };
    const p = this.mutationChain.then(run, run);
    this.mutationChain = p.catch(() => undefined);
    return p;
  }

  /* ---------------------------------- CRUD ----------------------------------- */

  list(): Automation[] {
    return [...this.automations.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): Automation {
    const automation = this.automations.get(id);
    if (!automation) throw new AutomationNotFoundError(id);
    return automation;
  }

  /** Validates input, then checks commands against devices the cache knows about. */
  private validate(body: unknown): ReturnType<typeof validateAutomationInput> {
    const input = validateAutomationInput(body, { sunAvailable: this.deps.location !== null });
    for (const [i, action] of input.actions.entries()) {
      if (action.type !== 'device_command') continue;
      const device = this.deps.cache.get(action.deviceId ?? '');
      if (device && device.commands.length > 0 && !device.commands.includes(action.command ?? '')) {
        throw new AutomationValidationError(`Action ${i + 1}: "${device.label}" does not support "${action.command}"`);
      }
    }
    return input;
  }

  async create(body: unknown): Promise<Automation> {
    const input = this.validate(body);
    const now = new Date().toISOString();
    const automation: Automation = { id: uuidv4(), ...input, enabled: input.enabled ?? true, createdAt: now, updatedAt: now };
    await this.commit((next) => next.set(automation.id, automation));
    console.log(`[automations] created "${automation.name}" (${automation.id})`);
    return automation;
  }

  async update(id: string, body: unknown): Promise<Automation> {
    const existing = this.get(id);
    const input = this.validate(body);
    const updated: Automation = {
      ...input,
      id,
      enabled: input.enabled ?? existing.enabled,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.commit((next) => {
      if (!next.has(id)) throw new AutomationNotFoundError(id);
      next.set(id, updated);
    });
    console.log(`[automations] updated "${updated.name}" (${id})`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const existing = this.get(id);
    await this.commit((next) => {
      next.delete(id);
    });
    this.lastRun.delete(id);
    console.log(`[automations] deleted "${existing.name}" (${id})`);
  }

  async toggle(id: string, enabled?: boolean): Promise<Automation> {
    const existing = this.get(id);
    const updated: Automation = {
      ...existing,
      enabled: typeof enabled === 'boolean' ? enabled : !existing.enabled,
      updatedAt: new Date().toISOString(),
    };
    await this.commit((next) => {
      if (!next.has(id)) throw new AutomationNotFoundError(id);
      next.set(id, updated);
    });
    console.log(`[automations] ${updated.enabled ? 'enabled' : 'disabled'} "${updated.name}"`);
    return updated;
  }

  /** Runs a saved automation's actions now, ignoring conditions and debounce. */
  async test(id: string): Promise<AutomationLog> {
    const automation = this.get(id);
    return (await this.execute(automation, 'Manual test', { manual: true }))!;
  }

  /** Runs an unsaved draft's actions now (editor "Test" button). Not recorded in the log. */
  async testDraft(body: unknown): Promise<AutomationLog> {
    const input = this.validate(body);
    const now = new Date().toISOString();
    const draft: Automation = { id: 'draft', ...input, enabled: true, createdAt: now, updatedAt: now };
    return (await this.execute(draft, 'Manual test (unsaved)', { manual: true, record: false }))!;
  }

  getLogs(limit = 50): AutomationLog[] {
    return this.logs.slice(-limit).reverse();
  }

  /* -------------------------------- triggers --------------------------------- */

  /** Called with attribute changes detected by the device poller. */
  checkTriggers(changes: AttributeChange[]): void {
    try {
      for (const automation of this.automations.values()) {
        const t = automation.trigger;
        if (!automation.enabled || t.type !== 'device_state') continue;
        const match = changes.find(
          (c) => c.deviceId === t.deviceId && c.attribute === t.attribute && valuesMatch(c.value, t.value ?? ''),
        );
        if (match) {
          const reason = `${match.deviceName} → ${match.attribute}: ${String(match.value)}`;
          void this.execute(automation, reason, {}).catch((err) => {
            console.error(`[automations] "${automation.name}" failed: ${errorMessage(err)}`);
          });
        }
      }
    } catch (err) {
      console.error('[automations] trigger check failed:', err);
    }
  }

  private rebuildSchedules(): void {
    for (const job of this.jobs.values()) void job.destroy();
    this.jobs.clear();

    for (const automation of this.automations.values()) {
      const t = automation.trigger;
      if (!automation.enabled || (t.type !== 'schedule' && t.type !== 'time_of_day')) continue;
      const expr = t.type === 'schedule' ? (t.cron ?? '') : timeOfDayToCron(t);
      const reason = t.type === 'schedule' ? `Schedule (${expr})` : `Time of day (${t.time})`;
      try {
        const job = cron.schedule(
          expr,
          () => {
            const current = this.automations.get(automation.id);
            if (!current?.enabled) return;
            void this.execute(current, reason, {}).catch((err) => {
              console.error(`[automations] "${current.name}" failed: ${errorMessage(err)}`);
            });
          },
          { timezone: this.deps.timezone, name: `automation-${automation.id}`, noOverlap: true },
        );
        this.jobs.set(automation.id, job);
      } catch (err) {
        console.error(`[automations] could not schedule "${automation.name}" (${expr}): ${errorMessage(err)}`);
      }
    }
  }

  /** Device-state automations need the poller running even with no dashboards open. */
  private updatePollingDemand(): void {
    const needsPolling = [...this.automations.values()].some((a) => a.enabled && a.trigger.type === 'device_state');
    this.deps.cache.setPollingDemand('automations', needsPolling);
  }

  /* -------------------------------- execution -------------------------------- */

  private async conditionsMet(conditions: AutomationCondition[]): Promise<boolean> {
    if (conditions.some((c) => (c.type ?? 'device') === 'device')) {
      await this.deps.cache.getSnapshot(); // refresh if the cache is older than one poll
    }
    const now = new Date();
    for (const c of conditions) {
      const type = c.type ?? 'device';
      if (type === 'time') {
        const [h, m] = c.value.split(':').map(Number);
        const current = minutesInZone(now, this.deps.timezone);
        const target = h * 60 + m;
        if (c.operator === 'after' ? current < target : current >= target) return false;
      } else if (type === 'sun') {
        const loc = this.deps.location;
        if (!loc) return false;
        const dark = isDark(now, loc.latitude, loc.longitude);
        if ((c.value === 'dark') !== dark) return false;
      } else {
        const device = this.deps.cache.get(c.deviceId ?? '');
        const actual = device?.attributes[c.attribute ?? ''];
        if (actual === undefined || actual === null) return false;
        if (c.operator === 'equals' && !valuesMatch(actual, c.value)) return false;
        if (c.operator === 'not_equals' && valuesMatch(actual, c.value)) return false;
        if (c.operator === 'greater_than' || c.operator === 'less_than') {
          const a = Number(actual);
          const e = Number(c.value);
          if (!Number.isFinite(a) || !Number.isFinite(e)) return false;
          if (c.operator === 'greater_than' ? !(a > e) : !(a < e)) return false;
        }
      }
    }
    return true;
  }

  private describeAction(action: AutomationAction): string {
    if (action.type === 'delay') return `Wait ${action.seconds}s`;
    const name = this.deps.cache.get(action.deviceId ?? '')?.label ?? `device ${action.deviceId}`;
    const v = action.value;
    switch (action.command) {
      case 'on':
        return `Turn on ${name}`;
      case 'off':
        return `Turn off ${name}`;
      case 'lock':
        return `Lock ${name}`;
      case 'unlock':
        return `Unlock ${name}`;
      case 'setLevel':
        return `Set ${name} to ${v}%`;
      default:
        return v === undefined ? `${name}: ${action.command}` : `${name}: ${action.command}(${v})`;
    }
  }

  private async runAction(action: AutomationAction): Promise<AutomationActionResult> {
    const description = this.describeAction(action);
    try {
      if (action.type === 'delay') {
        await sleep((action.seconds ?? 0) * 1000);
      } else {
        await executeCommand(this.deps.client, this.deps.cache, {
          deviceId: action.deviceId ?? '',
          command: action.command ?? '',
          ...(action.value !== undefined ? { value: action.value } : {}),
        });
      }
      console.log(`[automations]   ✓ ${description}`);
      return { description, success: true };
    } catch (err) {
      const error = errorMessage(err);
      console.warn(`[automations]   ✗ ${description}: ${error}`);
      return { description, success: false, error };
    }
  }

  private async execute(
    automation: Automation,
    reason: string,
    options: { manual?: boolean; record?: boolean },
  ): Promise<AutomationLog | null> {
    const { manual = false, record = true } = options;
    const id = automation.id;

    if (!manual) {
      const last = this.lastRun.get(id);
      if (this.running.has(id)) return null;
      if (last !== undefined && Date.now() - last < DEBOUNCE_MS) {
        console.log(`[automations] "${automation.name}" debounced (${reason})`);
        return null;
      }
      if (automation.conditions?.length && !(await this.conditionsMet(automation.conditions))) {
        console.log(`[automations] "${automation.name}" triggered (${reason}) but conditions not met`);
        return null;
      }
    }

    const tracked = record;
    if (tracked) {
      this.running.add(id);
      this.lastRun.set(id, Date.now());
    }

    const entry: AutomationLog = {
      id: uuidv4(),
      automationId: id,
      automationName: automation.name,
      triggeredAt: new Date().toISOString(),
      triggerReason: reason,
      actions: [],
    };
    console.log(`[automations] running "${automation.name}" — ${reason}`);

    try {
      for (const [index, action] of automation.actions.entries()) {
        if (!manual && index > 0 && !this.automations.get(id)?.enabled) {
          entry.actions.push({ description: 'Stopped: automation was disabled or deleted', success: false });
          break;
        }
        entry.actions.push(await this.runAction(action));
      }
    } finally {
      if (tracked) {
        this.running.delete(id);
        // Debounce counts from the end of the run so state changes caused by our own actions can't re-trigger it.
        this.lastRun.set(id, Date.now());
      }
    }

    if (record) {
      this.logs.push(entry);
      if (this.logs.length > LOG_CAPACITY) this.logs.splice(0, this.logs.length - LOG_CAPACITY);
      this.emit('executed', entry);
    }
    return entry;
  }
}
