import { Device, HubitatRawDevice, HubitatRawAttribute } from '../types/index';

function normalizeDevice(raw: HubitatRawDevice): Device {
  const attributes: Record<string, string | number | boolean | null> = {};
  if (Array.isArray(raw.attributes)) {
    for (const attr of raw.attributes) {
      attributes[attr.name] = attr.currentValue;
    }
  } else if (raw.attributes && typeof raw.attributes === 'object') {
    // Already a map (some Hubitat firmware versions return this format)
    const attrMap = raw.attributes as unknown as Record<string, HubitatRawAttribute>;
    for (const [key, val] of Object.entries(attrMap)) {
      attributes[key] = typeof val === 'object' && val !== null
        ? (val as HubitatRawAttribute).currentValue
        : val as string | number | boolean | null;
    }
  }

  const commands: string[] = Array.isArray(raw.commands)
    ? raw.commands.map((c) => (typeof c === 'string' ? c : c.command))
    : [];

  return {
    id: String(raw.id),
    name: raw.name || '',
    label: raw.label || raw.name || '',
    type: raw.type || '',
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
    attributes,
    commands,
  };
}

class HubitatClient {
  private baseUrl: string;
  private token: string;
  private mode: 'local' | 'cloud';

  constructor() {
    this.mode = (process.env.HUBITAT_MODE as 'local' | 'cloud') || 'local';

    if (this.mode === 'cloud') {
      const hubId = process.env.HUBITAT_HUB_ID;
      const appId = process.env.HUBITAT_APP_ID;
      this.token = process.env.HUBITAT_CLOUD_TOKEN || '';
      if (!hubId || !appId || !this.token) {
        throw new Error('HUBITAT_HUB_ID, HUBITAT_APP_ID, and HUBITAT_CLOUD_TOKEN are required in cloud mode');
      }
      this.baseUrl = `https://cloud.hubitat.com/api/${hubId}/apps/${appId}`;
    } else {
      const host = process.env.HUBITAT_HOST;
      const appId = process.env.HUBITAT_APP_ID;
      this.token = process.env.HUBITAT_ACCESS_TOKEN || '';
      if (!host || !appId || !this.token) {
        throw new Error('HUBITAT_HOST, HUBITAT_APP_ID, and HUBITAT_ACCESS_TOKEN are required in local mode');
      }
      this.baseUrl = `${host}/apps/api/${appId}`;
    }
  }

  getMode(): 'local' | 'cloud' {
    return this.mode;
  }

  private buildUrl(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}access_token=${this.token}`;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Hubitat API error: ${response.status} ${response.statusText} for ${path}`);
    }
    return response.json() as Promise<T>;
  }

  async getAllDevices(): Promise<Device[]> {
    // /devices/all returns full device detail including attributes
    const raw = await this.fetchJson<HubitatRawDevice[]>('/devices/all');
    return raw.map(normalizeDevice);
  }

  async getDevices(): Promise<Device[]> {
    return this.getAllDevices();
  }

  async getDevice(deviceId: string): Promise<Device> {
    const raw = await this.fetchJson<HubitatRawDevice>(`/devices/${deviceId}`);
    return normalizeDevice(raw);
  }

  async sendCommand(deviceId: string, command: string, value?: string | number): Promise<void> {
    const path = value !== undefined
      ? `/devices/${deviceId}/${command}/${encodeURIComponent(String(value))}`
      : `/devices/${deviceId}/${command}`;
    const url = this.buildUrl(path);
    console.log(`[hubitat] sendCommand URL: ${url}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Hubitat command error: ${response.status} ${response.statusText}`);
    }
    // Consume body but don't parse — command responses may not be JSON
    await response.text();
  }
}

export const hubitatClient = new HubitatClient();
