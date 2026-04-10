import { Device, DeviceUpdate, CachedDeviceState } from '../types/index';
import { hubitatClient } from './hubitat';

type ChangeListener = (updates: DeviceUpdate[]) => void;

class DeviceCache {
  private devices: Map<string, Device> = new Map();
  private lastUpdated: number = 0;
  private stale: boolean = false;
  private listeners: Set<ChangeListener> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  addChangeListener(fn: ChangeListener) {
    this.listeners.add(fn);
  }

  removeChangeListener(fn: ChangeListener) {
    this.listeners.delete(fn);
  }

  private notify(updates: DeviceUpdate[]) {
    for (const fn of this.listeners) {
      fn(updates);
    }
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getCachedState(): CachedDeviceState {
    return {
      devices: this.getDevices(),
      lastUpdated: this.lastUpdated,
      stale: this.stale,
    };
  }

  async updateDevices(fresh: Device[]): Promise<DeviceUpdate[]> {
    const updates: DeviceUpdate[] = [];

    for (const device of fresh) {
      const existing = this.devices.get(device.id);
      if (!existing) {
        // New device
        this.devices.set(device.id, device);
        updates.push({ id: device.id, attributes: device.attributes });
        continue;
      }

      // Diff attributes
      const changedAttrs: Record<string, string | number | boolean | null> = {};
      let changed = false;

      for (const [key, val] of Object.entries(device.attributes)) {
        if (existing.attributes[key] !== val) {
          changedAttrs[key] = val;
          changed = true;
        }
      }

      // Also check for removed attributes
      for (const key of Object.keys(existing.attributes)) {
        if (!(key in device.attributes)) {
          changedAttrs[key] = null;
          changed = true;
        }
      }

      if (changed) {
        this.devices.set(device.id, device);
        updates.push({ id: device.id, attributes: changedAttrs });
      }
    }

    // Remove devices no longer returned
    const freshIds = new Set(fresh.map((d) => d.id));
    for (const id of this.devices.keys()) {
      if (!freshIds.has(id)) {
        this.devices.delete(id);
      }
    }

    this.lastUpdated = Date.now();
    this.stale = false;

    return updates;
  }

  markStale() {
    this.stale = true;
  }

  startPolling() {
    const mode = hubitatClient.getMode();
    const intervalMs = mode === 'cloud' ? 8_000 : 5_000;

    const poll = async () => {
      try {
        const fresh = await hubitatClient.getAllDevices();
        const updates = await this.updateDevices(fresh);
        if (updates.length > 0) {
          this.notify(updates);
        }
      } catch (err) {
        console.error('[DeviceCache] Poll error:', err instanceof Error ? err.message : err);
        this.markStale();
      }
    };

    // Initial fetch
    poll();

    this.pollTimer = setInterval(poll, intervalMs);
    console.log(`[DeviceCache] Polling Hubitat every ${intervalMs / 1000}s (${mode} mode)`);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const deviceCache = new DeviceCache();
