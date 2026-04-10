import { useState, useCallback } from 'react';
import { Device, DeviceUpdate, CachedDeviceState, CommandRequest } from '../types/devices';

interface DevicesState {
  devices: Device[];
  lastUpdated: Date;
  stale: boolean;
  initialized: boolean;
}

export function useDevices() {
  const [state, setState] = useState<DevicesState>({
    devices: [],
    lastUpdated: new Date(),
    stale: false,
    initialized: false,
  });
  const handleFullState = useCallback((fullState: CachedDeviceState) => {
    setState({
      devices: fullState.devices,
      lastUpdated: new Date(fullState.lastUpdated || Date.now()),
      stale: fullState.stale,
      initialized: true,
    });
  }, []);

  const handleDeviceUpdates = useCallback((updates: DeviceUpdate[]) => {
    setState((prev) => {
      const deviceMap = new Map(prev.devices.map((d) => [d.id, d]));
      for (const update of updates) {
        const existing = deviceMap.get(update.id);
        if (existing) {
          deviceMap.set(update.id, {
            ...existing,
            attributes: { ...existing.attributes, ...update.attributes },
          });
        }
      }
      return {
        ...prev,
        devices: Array.from(deviceMap.values()),
        lastUpdated: new Date(),
        stale: false,
      };
    });
  }, []);

  const sendCommand = useCallback(
    async (deviceId: string, cmd: CommandRequest): Promise<boolean> => {
      // Optimistic update: apply expected state change immediately
      setState((prev) => {
        const updated = prev.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const attrs = { ...d.attributes };
          // Map common commands to their attribute effects
          if (cmd.command === 'on') attrs['switch'] = 'on';
          else if (cmd.command === 'off') attrs['switch'] = 'off';
          else if (cmd.command === 'lock') attrs['lock'] = 'locked';
          else if (cmd.command === 'unlock') attrs['lock'] = 'unlocked';
          else if (cmd.command === 'setLevel' && cmd.value !== undefined) attrs['level'] = cmd.value;
          else if (cmd.command === 'setColor' && cmd.value !== undefined) attrs['color'] = cmd.value;
          return { ...d, attributes: attrs };
        });
        return { ...prev, devices: updated };
      });

      try {
        const res = await fetch(`/api/devices/${deviceId}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(cmd),
        });

        if (!res.ok) {
          // Revert is handled by next WS poll — just signal failure
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  return {
    devices: state.devices,
    lastUpdated: state.lastUpdated,
    stale: state.stale,
    initialized: state.initialized,
    handleFullState,
    handleDeviceUpdates,
    sendCommand,
  };
}
