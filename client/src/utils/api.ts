export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * JSON fetch wrapper for the HubiDash API. Never throws; a 401 calls
 * `onUnauthorized` so the app can return to the login screen.
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; onUnauthorized?: () => void; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body, onUnauthorized, signal } = options;
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) onUnauthorized?.();
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
      return { ok: false, status: res.status, data: null, error: message };
    }
    return { ok: true, status: res.status, data: data as T, error: null };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { ok: false, status: 0, data: null, error: 'Cancelled' };
    return { ok: false, status: 0, data: null, error: 'Unable to reach the server' };
  }
}
