import { useCallback, useEffect, useState } from 'react';
import type { HubitatMode } from '../types/devices';

export type AuthStatus = 'checking' | 'unauthenticated' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  wsToken: string | null;
  mode: HubitatMode | null;
}

interface AuthResponse {
  authenticated?: boolean;
  wsToken?: string;
  mode?: HubitatMode;
  error?: string;
}

export interface AuthApi extends AuthState {
  /** Resolves to null on success, or an error message. */
  login: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  /** Call when the server reports the session is gone (401 / WS auth failure). */
  expire: () => void;
}

const SIGNED_OUT: AuthState = { status: 'unauthenticated', wsToken: null, mode: null };

async function readJson(res: Response): Promise<AuthResponse> {
  try {
    return (await res.json()) as AuthResponse;
  } catch {
    return {};
  }
}

/**
 * Session state for the whole app. Instantiate exactly once, at the App root,
 * and pass values down as props.
 */
export function useAuth(): AuthApi {
  const [state, setState] = useState<AuthState>({ status: 'checking', wsToken: null, mode: null });

  const checkSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin', signal });
      const data = await readJson(res);
      if (res.ok && data.authenticated && data.wsToken) {
        setState({ status: 'authenticated', wsToken: data.wsToken, mode: data.mode ?? null });
      } else {
        setState(SIGNED_OUT);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setState(SIGNED_OUT);
    }
  }, []);

  // Session restore on page load.
  useEffect(() => {
    const controller = new AbortController();
    void checkSession(controller.signal);
    return () => controller.abort();
  }, [checkSession]);

  const login = useCallback(async (password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await readJson(res);
      if (res.ok && data.wsToken) {
        setState({ status: 'authenticated', wsToken: data.wsToken, mode: data.mode ?? null });
        return null;
      }
      return data.error ?? (res.status === 401 ? 'Incorrect password' : `Login failed (${res.status})`);
    } catch {
      return 'Unable to reach the server';
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      setState(SIGNED_OUT);
    }
  }, []);

  const expire = useCallback(() => {
    // Double-check with the server; a transient WS close shouldn't log the user out.
    void checkSession();
  }, [checkSession]);

  return { ...state, login, logout, expire };
}
