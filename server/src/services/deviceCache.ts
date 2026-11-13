import { EventEmitter } from 'node:events';
import type { HubitatClient } from './hubitat.js';
import type { AttributeChange, CacheStatus, Device, DeviceChanges, DeviceSnapshot } from '../types/index.js';

function fingerprint(device: Device): string {
  return JSON.stringify([
    device.label,
    device.name,
    device.type,
    device.room,
    device.attributes,
    device.commands,
    device.capabilities,
  ]);
}

export interface DeviceCacheEvents {
  changes: [DeviceChanges];
  status: [CacheStatus];
  /** Per-attribute changes on devices that were already known (never fired for the initial load). */
  attributeChanges: [AttributeChange[]];
}

function attributeChanges(previous: Device, next: Device): AttributeChange[] {
  const result: AttributeChange[] = [];
  const keys = new Set([...Object.keys(previous.attributes), ...Object.keys(next.attributes)]);
  for (const attribute of keys) {
    const before = previous.attributes[attribute] ?? null;
    const after = next.attributes[attribute] ?? null;
    if (String(before) !== String(after)) {
      result.push({ deviceId: next.id, deviceName: next.label, attribute, value: after, previous: before });
    }
  }
  return result;
}

/**
 * Holds the last known state of every device, polls the hub, and emits
 * diffs. When the hub is unreachable the last known state is kept and
 * flagged stale.
 */
export class DeviceCache extends EventEmitter<DeviceCacheEvents> {
  private readonly devices = new Map<string, Device>();
  private readonly fingerprints = new Map<string, string>();
  private lastUpdated: Date | null = null;
  private stale = false;
  private inflight: Promise<boolean> | null = null;

  private pollGeneration = 0;
  private polling = false;
  private readonly pollingDemand = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private soonTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: HubitatClient,
    readonly pollIntervalMs: number,
  ) {
    super();
  }

  get hasData(): boolean {
    return this.lastUpdated !== null;
  }

  get(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  status(): CacheStatus {
    return { stale: this.stale, lastUpdated: this.lastUpdated?.toISOString() ?? null };
  }

  snapshot(): DeviceSnapshot {
    return {
      devices: [...this.devices.values()],
      ...this.status(),
      mode: this.client.mode,
    };
  }

  private isFresh(): boolean {
    return (
      this.lastUpdated !== null &&
      !this.stale &&
      Date.now() - this.lastUpdated.getTime() < this.pollIntervalMs
    );
  }

  /** Returns a snapshot, refreshing from the hub first if the cache is older than one poll interval. */
  async getSnapshot(): Promise<DeviceSnapshot> {
    if (!this.isFresh()) await this.refresh();
    return this.snapshot();
  }

  /** Fetches all devices from the hub. Concurrent callers share one in-flight request. */
  refresh(): Promise<boolean> {
    if (!this.inflight) {
      this.inflight = this.doRefresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const devices = await this.client.getAllDevices();
      const changed: Device[] = [];
      const attrChanges: AttributeChange[] = [];
      const seen = new Set<string>();

      for (const device of devices) {
        seen.add(device.id);
        const fp = fingerprint(device);
        if (this.fingerprints.get(device.id) !== fp) {
          this.fingerprints.set(device.id, fp);
          changed.push(device);
          const previous = this.devices.get(device.id);
          if (previous) attrChanges.push(...attributeChanges(previous, device));
        }
        this.devices.set(device.id, device);
      }

      const removed: string[] = [];
      for (const id of this.devices.keys()) {
        if (!seen.has(id)) removed.push(id);
      }
      for (const id of removed) {
        this.devices.delete(id);
        this.fingerprints.delete(id);
      }

      if (this.stale) console.log('[cache] hub reachable again');
      this.stale = false;
      this.lastUpdated = new Date();

      if (changed.length > 0 || removed.length > 0) {
        this.emit('changes', { changed, removed, ...this.status() });
      } else {
        this.emit('status', this.status());
      }
      if (attrChanges.length > 0) this.emit('attributeChanges', attrChanges);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!this.stale) console.warn('[cache] hub refresh failed, serving last known state:', message);
      this.stale = true;
      this.emit('status', this.status());
      return false;
    }
  }

  /**
   * Polling runs while at least one source needs it: live dashboard clients ("ws")
   * or enabled device-state automations ("automations").
   */
  setPollingDemand(source: string, active: boolean): void {
    if (active) this.pollingDemand.add(source);
    else this.pollingDemand.delete(source);
    if (this.pollingDemand.size > 0) this.startPolling();
    else this.stopPolling();
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    const generation = ++this.pollGeneration;
    console.log(`[cache] polling every ${this.pollIntervalMs}ms`);

    const tick = async (): Promise<void> => {
      if (!this.polling || generation !== this.pollGeneration) return;
      await this.refresh();
      if (this.polling && generation === this.pollGeneration) {
        this.pollTimer = setTimeout(() => void tick(), this.pollIntervalMs);
      }
    };
    void tick();
  }

  stopPolling(): void {
    if (!this.polling) return;
    this.polling = false;
    this.pollGeneration++;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.soonTimer) clearTimeout(this.soonTimer);
    this.pollTimer = null;
    this.soonTimer = null;
    console.log('[cache] polling paused (no live clients or device-triggered automations)');
  }

  /** Schedules a quick out-of-band refresh, e.g. right after a command so clients see the result fast. */
  refreshSoon(delayMs = 1_200): void {
    if (this.soonTimer) clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => {
      this.soonTimer = null;
      void this.refresh();
    }, delayMs);
  }
}
