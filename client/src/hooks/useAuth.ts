import { useState, useEffect, useCallback } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  wsToken: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    wsToken: null,
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { authenticated: boolean; wsToken: string };
        setState({ isAuthenticated: true, isLoading: false, wsToken: data.wsToken });
      } else {
        setState({ isAuthenticated: false, isLoading: false, wsToken: null });
      }
    } catch {
      setState({ isAuthenticated: false, isLoading: false, wsToken: null });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; wsToken: string };
        setState({ isAuthenticated: true, isLoading: false, wsToken: data.wsToken });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setState({ isAuthenticated: false, isLoading: false, wsToken: null });
  }, []);

  return {
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    wsToken: state.wsToken,
    login,
    logout,
  };
}
