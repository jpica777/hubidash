import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import type {
  AttributeValue,
  CommandFn,
  ConnectionStatus,
  Device,
  DeviceSnapshot,
  ServerMessage,
} from '../types/devices';
import { valuesEqual } from '../utils/deviceHelpers';

/** How long an optimistic value is shown while waiting for the hub to confirm it. */
const OPTIMISTIC_TTL_MS = 12_000;
const COMMAND_TIMEOUT_MS = 12_000;

interface OverlayEntry {
  value: AttributeValue;
  opId: number;
  expiresAt: number;
}

type Overlays = Record<string, Record<string, OverlayEntry>>;

interface PendingRequest {
  resolve: (result: { ok: boolean; error?: string }) => void;
  timer: number;
}

interface UseDevicesOptions {
  wsToken: string;
  onUnauthorized: () => void;
}

export interface UseDevicesResult {
  devices: Device[];
  loaded: boolean;
  loadError: string | null;
  stale: boolean;
  lastUpdated: string | null;
  connection: ConnectionStatus;
  sendCommand: CommandFn;
  commandError: string | null;
  dismissCommandError: () => void;
}

let opCounter = 0;

function removeOp(overlays: Overlays, deviceId: string, opId: number): Overlays {
  const current = overlays[deviceId];
  if (!current) return overlays;
  const next: Record<string, OverlayEntry> = {};
  for (const [attr, entry] of Object.entries(current)) {
    if (entry.opId !== opId) next[attr] = entry;
  }
  const result = { ...overlays };
  if (Object.keys(next).length) result[deviceId] = next;
  else delete result[deviceId];
  return result;
}

export function useDevices({ wsToken, onUnauthorized }: UseDevicesOptions): UseDevicesResult {
  const [serverDevices, setServerDevices] = useState<Map<string, Device>>(() => new Map());
  const [overlays, setOverlays] = useState<Overlays>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const pending = useRef(new Map<string, PendingRequest>());

  const applySnapshot = useCallback((snapshot: Pick<DeviceSnapshot, 'devices' | 'stale' | 'lastUpdated'>) => {
    setServerDevices(new Map(snapshot.devices.map((d) => [d.id, d])));
    setStale(snapshot.stale);
    setLastUpdated(snapshot.lastUpdated);
    setLoaded(true);
    setLoadError(null);
  }, []);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'snapshot':
          applySnapshot(msg);
          break;
        case 'update':
          setServerDevices((prev) => {
            const next = new Map(prev);
            for (const device of msg.devices) next.set(device.id, device);
            for (const id of msg.removed) next.delete(id);
            return next;
          });
          setStale(msg.stale);
          setLastUpdated(msg.lastUpdated);
          setLoaded(true);
          break;
        case 'status':
          setStale(msg.stale);
          setLastUpdated(msg.lastUpdated);
          break;
        case 'commandResult': {
          const req = pending.current.get(msg.requestId);
          if (req) {
            window.clearTimeout(req.timer);
            pending.current.delete(msg.requestId);
            req.resolve({ ok: msg.ok, error: msg.error });
          }
          break;
        }
        default:
          break;
      }
    },
    [applySnapshot],
  );

  const { status: connection, send } = useWebSocket({
    token: wsToken,
    onMessage: handleMessage,
    onAuthFailed: onUnauthorized,
  });

  // Initial REST load for a fast first paint (the WS snapshot follows shortly).
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/devices', { credentials: 'same-origin', signal: controller.signal });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = (await res.json()) as DeviceSnapshot & { error?: string };
        if (res.ok) {
          applySnapshot(data);
        } else {
          setLoadError(data.error ?? `Failed to load devices (${res.status})`);
          setStale(true);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setLoadError('Unable to reach the server');
      }
    })();
    return () => controller.abort();
  }, [applySnapshot, onUnauthorized]);

  // Drop optimistic values once the server confirms them.
  useEffect(() => {
    setOverlays((prev) => {
      let changed = false;
      const next: Overlays = {};
      for (const [deviceId, attrs] of Object.entries(prev)) {
        const device = serverDevices.get(deviceId);
        const kept: Record<string, OverlayEntry> = {};
        for (const [attr, entry] of Object.entries(attrs)) {
          if (device && valuesEqual(device.attributes[attr], entry.value)) changed = true;
          else kept[attr] = entry;
        }
        if (Object.keys(kept).length) next[deviceId] = kept;
      }
      return changed ? next : prev;
    });
  }, [serverDevices]);

  // Expire optimistic values the hub never confirmed (falls back to server truth).
  useEffect(() => {
    const expiries = Object.values(overlays).flatMap((attrs) => Object.values(attrs).map((e) => e.expiresAt));
    if (!expiries.length) return undefined;
    const delay = Math.max(0, Math.min(...expiries) - Date.now()) + 50;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setOverlays((prev) => {
        const next: Overlays = {};
        for (const [deviceId, attrs] of Object.entries(prev)) {
          const kept = Object.fromEntries(Object.entries(attrs).filter(([, e]) => e.expiresAt > now));
          if (Object.keys(kept).length) next[deviceId] = kept;
        }
        return next;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [overlays]);

  // Resolve any outstanding WS requests on unmount.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const req of map.values()) {
        window.clearTimeout(req.timer);
        req.resolve({ ok: false, error: 'Disconnected' });
      }
      map.clear();
    };
  }, []);

  const sendViaWs = useCallback(
    (deviceId: string, command: string, value?: string | number): Promise<{ ok: boolean; error?: string }> => {
      const requestId = `${Date.now().toString(36)}-${(opCounter += 1)}`;
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          pending.current.delete(requestId);
          resolve({ ok: false, error: 'Command timed out' });
        }, COMMAND_TIMEOUT_MS);
        pending.current.set(requestId, { resolve, timer });
        const sent = send({ type: 'command', requestId, deviceId, command, ...(value !== undefined ? { value } : {}) });
        if (!sent) {
          window.clearTimeout(timer);
          pending.current.delete(requestId);
          resolve({ ok: false, error: 'not-sent' });
        }
      });
    },
    [send],
  );

  const sendViaRest = useCallback(
    async (deviceId: string, command: string, value?: string | number): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value !== undefined ? { command, value } : { command }),
        });
        if (res.status === 401) {
          onUnauthorized();
          return { ok: false, error: 'Session expired' };
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return res.ok ? { ok: true } : { ok: false, error: data.error ?? `Command failed (${res.status})` };
      } catch {
        return { ok: false, error: 'Unable to reach the server' };
      }
    },
    [onUnauthorized],
  );

  const sendCommand = useCallback<CommandFn>(
    async (deviceId, command, value, optimistic) => {
      const opId = (opCounter += 1);
      if (optimistic && Object.keys(optimistic).length) {
        const expiresAt = Date.now() + OPTIMISTIC_TTL_MS;
        setOverlays((prev) => {
          const attrs = { ...(prev[deviceId] ?? {}) };
          for (const [attr, v] of Object.entries(optimistic)) attrs[attr] = { value: v, opId, expiresAt };
          return { ...prev, [deviceId]: attrs };
        });
      }

      // Prefer the WebSocket for snappier round-trips; fall back to REST when it isn't live.
      let result = await sendViaWs(deviceId, command, value);
      if (!result.ok && result.error === 'not-sent') {
        result = await sendViaRest(deviceId, command, value);
      }

      if (!result.ok) {
        setOverlays((prev) => removeOp(prev, deviceId, opId)); // revert
        setCommandError(result.error ?? 'Command failed');
        return false;
      }
      return true;
    },
    [sendViaRest, sendViaWs],
  );

  const devices = useMemo(() => {
    const list: Device[] = [];
    for (const device of serverDevices.values()) {
      const overlay = overlays[device.id];
      if (!overlay) {
        list.push(device);
        continue;
      }
      const attributes = { ...device.attributes };
      for (const [attr, entry] of Object.entries(overlay)) attributes[attr] = entry.value;
      list.push({ ...device, attributes });
    }
    return list.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
  }, [serverDevices, overlays]);

  const dismissCommandError = useCallback(() => setCommandError(null), []);

  return {
    devices,
    loaded,
    loadError,
    stale,
    lastUpdated,
    connection,
    sendCommand,
    commandError,
    dismissCommandError,
  };
}
