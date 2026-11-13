import type { AttributeValue, Device, HubitatMode } from '../types/index.js';

export type HubitatOptions =
  | { mode: 'local'; host: string; appId: string; accessToken: string }
  | { mode: 'cloud'; hubId: string; appId: string; cloudToken: string };

export interface DeviceSummary {
  id: string;
  name: string;
  label: string;
  type: string;
  room: string | null;
}

export class HubitatError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HubitatError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'request timed out';
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${err.message} (${cause.message})`;
    return err.message;
  }
  return String(err);
}

/**
 * Normalizes the varied Maker API device shapes into a single Device type.
 * - /devices/all: attributes is an object map, capabilities mixes strings and objects
 * - /devices/{id}: attributes is an array of { name, currentValue }
 * - commands may be strings or { command } objects
 */
export function normalizeDevice(raw: unknown): Device | null {
  const r = asRecord(raw);
  if (!r || r.id === undefined || r.id === null) return null;

  const id = String(r.id);
  const name = typeof r.name === 'string' && r.name.trim() ? r.name : `Device ${id}`;
  const label = typeof r.label === 'string' && r.label.trim() ? r.label : name;
  const type = typeof r.type === 'string' ? r.type : '';
  const room = typeof r.room === 'string' && r.room.trim() ? r.room : null;

  const capabilities = Array.isArray(r.capabilities)
    ? r.capabilities.filter((c): c is string => typeof c === 'string')
    : [];

  const attributes: Record<string, AttributeValue> = {};
  if (Array.isArray(r.attributes)) {
    for (const entry of r.attributes) {
      const attr = asRecord(entry);
      if (attr && typeof attr.name === 'string') {
        attributes[attr.name] = toAttributeValue(attr.currentValue);
      }
    }
  } else {
    const attrMap = asRecord(r.attributes);
    if (attrMap) {
      for (const [key, value] of Object.entries(attrMap)) {
        attributes[key] = toAttributeValue(value);
      }
    }
  }

  const commands = Array.isArray(r.commands)
    ? r.commands
        .map((c) => (typeof c === 'string' ? c : asRecord(c)?.command))
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];

  return { id, name, label, type, room, capabilities, attributes, commands: [...new Set(commands)] };
}

/**
 * Thin client over the Hubitat Maker API. Works identically against the hub on the LAN
 * (local mode) or through cloud.hubitat.com (cloud mode); only the base URL and token differ.
 * All Maker API calls — including commands — are HTTP GET.
 */
export class HubitatClient {
  readonly mode: HubitatMode;
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: HubitatOptions) {
    this.mode = options.mode;
    if (options.mode === 'local') {
      const host = options.host.replace(/\/+$/, '');
      this.baseUrl = `${host}/apps/api/${options.appId}`;
      this.token = options.accessToken;
    } else {
      this.baseUrl = `https://cloud.hubitat.com/api/${options.hubId}/apps/${options.appId}`;
      this.token = options.cloudToken;
    }
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}?access_token=${encodeURIComponent(this.token)}`;
  }

  /** JSON GET for read endpoints only. Never used for commands. */
  private async fetchJson(path: string): Promise<unknown> {
    const url = this.buildUrl(path);
    let response: Response;
    let body: string;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      body = await response.text();
    } catch (err) {
      throw new HubitatError(`Hub unreachable: ${describeError(err)}`);
    }
    if (!response.ok) {
      throw new HubitatError(`Hubitat API error: ${response.status} ${response.statusText}`, response.status);
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new HubitatError('Hubitat returned a non-JSON response');
    }
  }

  /** GET /devices — lightweight list of all devices. */
  async getDevices(): Promise<DeviceSummary[]> {
    const data = await this.fetchJson('/devices');
    if (!Array.isArray(data)) throw new HubitatError('Unexpected /devices response shape');
    return data
      .map(normalizeDevice)
      .filter((d): d is Device => d !== null)
      .map(({ id, name, label, type, room }) => ({ id, name, label, type, room }));
  }

  /** GET /devices/all — every device with full attribute detail. */
  async getAllDevices(): Promise<Device[]> {
    const data = await this.fetchJson('/devices/all');
    if (!Array.isArray(data)) throw new HubitatError('Unexpected /devices/all response shape');
    return data.map(normalizeDevice).filter((d): d is Device => d !== null);
  }

  /** GET /devices/{id} — single device detail + attributes. */
  async getDevice(deviceId: string): Promise<Device> {
    const device = normalizeDevice(await this.fetchJson(`/devices/${deviceId}`));
    if (!device) throw new HubitatError(`Unexpected response for device ${deviceId}`);
    return device;
  }

  /** GET /devices/{id}/commands — available commands for a device. */
  async getDeviceCommands(deviceId: string): Promise<string[]> {
    const data = await this.fetchJson(`/devices/${deviceId}/commands`);
    if (!Array.isArray(data)) throw new HubitatError('Unexpected commands response shape');
    return data
      .map((c) => (typeof c === 'string' ? c : asRecord(c)?.command))
      .filter((c): c is string => typeof c === 'string');
  }

  /**
   * GET /devices/{id}/{command}[/{value}] — execute a command.
   * Plain GET, and the body is drained without parsing: Hubitat often returns
   * non-JSON or empty bodies for commands.
   */
  async sendCommand(deviceId: string, command: string, value?: string | number): Promise<void> {
    const path =
      value !== undefined
        ? `/devices/${deviceId}/${command}/${encodeURIComponent(String(value))}`
        : `/devices/${deviceId}/${command}`;
    const url = this.buildUrl(path);
    console.log('[hubitat] sendCommand:', url);
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new HubitatError(`Hub unreachable: ${describeError(err)}`);
    }
    if (!response.ok) {
      throw new HubitatError(`Hubitat command error: ${response.status} ${response.statusText}`, response.status);
    }
    await response.text(); // consume body without parsing
  }
}
