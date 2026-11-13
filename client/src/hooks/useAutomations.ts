import { useCallback, useEffect, useState } from 'react';
import type { Automation, AutomationDraft, AutomationLog, AutomationMeta } from '../types/devices';
import { apiRequest } from '../utils/api';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UseAutomationsResult {
  automations: Automation[];
  logs: AutomationLog[];
  meta: AutomationMeta | null;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Pushes a log entry received over the WebSocket. */
  addLog: (log: AutomationLog) => void;
  save: (draft: AutomationDraft, id?: string) => Promise<Result<Automation>>;
  remove: (id: string) => Promise<Result<null>>;
  toggle: (id: string, enabled: boolean) => Promise<Result<Automation>>;
  test: (id: string) => Promise<Result<AutomationLog>>;
  testDraft: (draft: AutomationDraft) => Promise<Result<AutomationLog>>;
}

const sortByName = (list: Automation[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

export function useAutomations(onUnauthorized: () => void): UseAutomationsResult {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [meta, setMeta] = useState<AutomationMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, log, metaRes] = await Promise.all([
      apiRequest<Automation[]>('/api/automations', { onUnauthorized }),
      apiRequest<AutomationLog[]>('/api/automations/log', { onUnauthorized }),
      apiRequest<AutomationMeta>('/api/automations/meta', { onUnauthorized }),
    ]);
    if (list.ok && list.data) {
      setAutomations(list.data);
      setError(null);
    } else {
      setError(list.error);
    }
    if (log.ok && log.data) setLogs(log.data);
    if (metaRes.ok && metaRes.data) setMeta(metaRes.data);
    setLoaded(true);
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLog = useCallback((log: AutomationLog) => {
    setLogs((prev) => [log, ...prev.filter((l) => l.id !== log.id)].slice(0, 50));
  }, []);

  const save = useCallback(
    async (draft: AutomationDraft, id?: string): Promise<Result<Automation>> => {
      const res = await apiRequest<Automation>(id ? `/api/automations/${id}` : '/api/automations', {
        method: id ? 'PUT' : 'POST',
        body: draft,
        onUnauthorized,
      });
      if (!res.ok || !res.data) return { ok: false, error: res.error ?? 'Save failed' };
      const saved = res.data;
      setAutomations((prev) => sortByName([...prev.filter((a) => a.id !== saved.id), saved]));
      return { ok: true, data: saved };
    },
    [onUnauthorized],
  );

  const remove = useCallback(
    async (id: string): Promise<Result<null>> => {
      const res = await apiRequest(`/api/automations/${id}`, { method: 'DELETE', onUnauthorized });
      if (!res.ok) return { ok: false, error: res.error ?? 'Delete failed' };
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      return { ok: true, data: null };
    },
    [onUnauthorized],
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<Result<Automation>> => {
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)));
      const res = await apiRequest<Automation>(`/api/automations/${id}/toggle`, {
        method: 'POST',
        body: { enabled },
        onUnauthorized,
      });
      if (!res.ok || !res.data) {
        setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)));
        return { ok: false, error: res.error ?? 'Update failed' };
      }
      const updated = res.data;
      setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      return { ok: true, data: updated };
    },
    [onUnauthorized],
  );

  const test = useCallback(
    async (id: string): Promise<Result<AutomationLog>> => {
      const res = await apiRequest<AutomationLog>(`/api/automations/${id}/test`, { method: 'POST', onUnauthorized });
      if (!res.ok || !res.data) return { ok: false, error: res.error ?? 'Test failed' };
      return { ok: true, data: res.data };
    },
    [onUnauthorized],
  );

  const testDraft = useCallback(
    async (draft: AutomationDraft): Promise<Result<AutomationLog>> => {
      const res = await apiRequest<AutomationLog>('/api/automations/test', {
        method: 'POST',
        body: draft,
        onUnauthorized,
      });
      if (!res.ok || !res.data) return { ok: false, error: res.error ?? 'Test failed' };
      return { ok: true, data: res.data };
    },
    [onUnauthorized],
  );

  return { automations, logs, meta, loaded, error, refresh, addLog, save, remove, toggle, test, testDraft };
}
