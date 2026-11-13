import { useCallback, useEffect, useState } from 'react';
import type { RuleAction, RuleSummary } from '../types/devices';
import { apiRequest } from '../utils/api';

export interface UseRulesResult {
  /** null until /api/rules/status has answered. */
  configured: boolean | null;
  rules: RuleSummary[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  act: (ruleId: string, action: RuleAction) => Promise<{ ok: boolean; error: string | null }>;
}

export function useRules(onUnauthorized: () => void): UseRulesResult {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ configured: boolean }>('/api/rules/status', {
      onUnauthorized,
      signal: controller.signal,
    }).then((res) => {
      if (res.ok && res.data) setConfigured(res.data.configured);
      else if (res.error !== 'Cancelled') setConfigured(false);
    });
    return () => controller.abort();
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await apiRequest<RuleSummary[]>('/api/rules', { onUnauthorized });
    setLoading(false);
    setLoaded(true);
    if (res.ok && res.data) {
      setRules(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [onUnauthorized]);

  const act = useCallback(
    async (ruleId: string, action: RuleAction) => {
      const res = await apiRequest<{ ok: boolean }>(`/api/rules/${encodeURIComponent(ruleId)}/${action}`, {
        method: 'POST',
        onUnauthorized,
      });
      if (res.ok && (action === 'pause' || action === 'resume')) {
        setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, paused: action === 'pause' } : r)));
      }
      return { ok: res.ok, error: res.error };
    },
    [onUnauthorized],
  );

  return { configured, rules, loading, loaded, error, refresh, act };
}
