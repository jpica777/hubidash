import type { RuleSummary } from '../types/index.js';

export interface RuleClientOptions {
  /** e.g. https://cloud.hubitat.com/api/{hubId}/apps/{rmAppId} or http://192.168.x.x/apps/api/{rmAppId} */
  url: string;
  /** Rule Machine's own access token (not the Maker API token). */
  token: string;
}

export class RuleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RuleError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const RULE_ID_RE = /^\d{1,10}$/;

type TriggerAction = 'runRule' | 'runRuleAct' | 'pauseRule' | 'resumeRule';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Hubitat decorates paused rule labels with an HTML "(Paused)" span; detect it and clean the name. */
function cleanRuleName(raw: string): { name: string; paused: boolean } {
  const text = decodeEntities(raw.replace(/<[^>]*>/g, ''));
  const paused = /\(\s*paused\s*\)/i.test(text);
  const name = text.replace(/\(\s*paused\s*\)/gi, '').replace(/\s+/g, ' ').trim();
  return { name, paused };
}

/**
 * Accepts the shapes Rule Machine has been seen to return:
 *   [{ id, name }]  |  [{ "123": "Rule name" }]  |  { "123": "Rule name" }  |  { rules: [...] }
 */
function parseRuleList(data: unknown): Array<{ id: string; rawName: string }> {
  const out: Array<{ id: string; rawName: string }> = [];
  const push = (id: unknown, name: unknown) => {
    if (id === null || id === undefined) return;
    const sid = String(id).trim();
    if (!RULE_ID_RE.test(sid)) return;
    out.push({ id: sid, rawName: typeof name === 'string' && name.trim() ? name : `Rule ${sid}` });
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      const rec = asRecord(item);
      if (!rec) continue;
      if ('id' in rec) push(rec.id, rec.name ?? rec.label);
      else for (const [k, v] of Object.entries(rec)) push(k, v);
    }
    return out;
  }

  const rec = asRecord(data);
  if (!rec) return out;
  if (Array.isArray(rec.rules)) return parseRuleList(rec.rules);
  for (const [k, v] of Object.entries(rec)) push(k, v);
  return out;
}

function normalizeIds(ruleId: string | string[]): string[] {
  const ids = (Array.isArray(ruleId) ? ruleId : [ruleId]).map((id) => String(id).trim());
  if (ids.length === 0 || ids.some((id) => !RULE_ID_RE.test(id))) {
    throw new RuleError('Invalid rule id', 400);
  }
  return ids;
}

/**
 * Optional client for Rule Machine's HTTP endpoints. When not configured every
 * method is a no-op (getRules returns []), so the rest of the app can call it freely.
 * All calls are GET; bodies are read as text and JSON-parsed only when possible.
 */
export class RuleClient {
  private readonly baseUrl: string | null;
  private readonly token: string | null;
  /** Pause state set through HubiDash, used when the hub's rule label doesn't say. */
  private readonly pausedOverrides = new Map<string, boolean>();

  constructor(options: RuleClientOptions | null) {
    this.baseUrl = options ? options.url.replace(/\/+$/, '') : null;
    this.token = options?.token ?? null;
  }

  get configured(): boolean {
    return this.baseUrl !== null && this.token !== null;
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}/${path}?access_token=${encodeURIComponent(this.token ?? '')}`;
  }

  private async get(path: string): Promise<unknown> {
    const url = this.buildUrl(path);
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      text = await response.text();
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'request timed out' : (err as Error).message;
      throw new RuleError(`Rule Machine unreachable: ${reason}`, 502);
    }
    if (!response.ok) {
      throw new RuleError(`Rule Machine error: ${response.status} ${response.statusText}`, 502);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  async getRules(): Promise<RuleSummary[]> {
    if (!this.configured) return [];
    const data = await this.get('getRuleList');
    if (typeof data === 'string') throw new RuleError('Rule Machine returned an unexpected rule list', 502);
    return parseRuleList(data)
      .map(({ id, rawName }) => {
        const { name, paused } = cleanRuleName(rawName);
        return { id, name: name || `Rule ${id}`, paused: paused || this.pausedOverrides.get(id) === true };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async trigger(action: TriggerAction, ruleId: string | string[]): Promise<string[]> {
    const ids = normalizeIds(ruleId);
    if (!this.configured) return ids;
    console.log(`[rules] ${action} ${ids.join('&')}`);
    await this.get(`trigger/${action}=${ids.join('&')}`);
    return ids;
  }

  /** Evaluate the rule's conditions and run its actions if true. */
  async runRule(ruleId: string | string[]): Promise<void> {
    await this.trigger('runRule', ruleId);
  }

  /** Run the rule's actions unconditionally. */
  async runRuleActions(ruleId: string | string[]): Promise<void> {
    await this.trigger('runRuleAct', ruleId);
  }

  async pauseRule(ruleId: string | string[]): Promise<void> {
    const ids = await this.trigger('pauseRule', ruleId);
    for (const id of ids) this.pausedOverrides.set(id, true);
  }

  async resumeRule(ruleId: string | string[]): Promise<void> {
    const ids = await this.trigger('resumeRule', ruleId);
    for (const id of ids) this.pausedOverrides.delete(id);
  }
}
