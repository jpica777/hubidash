import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ConnectionStatus, ServerMessage } from '../types/devices';

const MAX_BACKOFF_MS = 30_000;
/** After this many consecutive failed attempts the indicator turns red (retries continue). */
const DISCONNECTED_AFTER_ATTEMPTS = 4;
const WS_CLOSE_UNAUTHORIZED = 4401;

interface UseWebSocketOptions {
  token: string | null;
  onMessage: (msg: ServerMessage) => void;
  onAuthFailed: () => void;
}

interface UseWebSocketResult {
  status: ConnectionStatus;
  /** Sends a message if the socket is open and authenticated. Returns false otherwise. */
  send: (msg: ClientMessage) => boolean;
}

export function useWebSocket({ token, onMessage, onAuthFailed }: UseWebSocketOptions): UseWebSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const authedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const onAuthFailedRef = useRef(onAuthFailed);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onAuthFailedRef.current = onAuthFailed;
  }, [onMessage, onAuthFailed]);

  useEffect(() => {
    if (!token) return undefined;
    const authToken: string = token;

    let disposed = false;
    let attempt = 0;
    let retryTimer: number | null = null;

    const clearRetry = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS); // 1s, 2s, 4s, 8s, 16s, 30s…
      attempt += 1;
      setStatus(attempt >= DISCONNECTED_AFTER_ATTEMPTS ? 'disconnected' : 'reconnecting');
      clearRetry();
      retryTimer = window.setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      clearRetry();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;
      authedRef.current = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: authToken } satisfies ClientMessage));
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'auth_ok') {
          attempt = 0;
          authedRef.current = true;
          setStatus('live');
        }
        onMessageRef.current(msg);
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          authedRef.current = false;
        }
        if (disposed) return;
        if (event.code === WS_CLOSE_UNAUTHORIZED) {
          setStatus('disconnected');
          onAuthFailedRef.current();
          return;
        }
        scheduleReconnect();
      };

      // An error is always followed by a close event, which handles reconnection.
      ws.onerror = () => undefined;
    }

    // Reconnect immediately when the network comes back or the tab becomes visible.
    const reconnectNow = () => {
      if (disposed || wsRef.current) return;
      attempt = 0;
      setStatus('reconnecting');
      connect();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconnectNow();
    };

    setStatus('connecting');
    connect();
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      clearRetry();
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisibility);
      const ws = wsRef.current;
      wsRef.current = null;
      authedRef.current = false;
      ws?.close(1000, 'Client closed');
    };
  }, [token]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  return { status, send };
}
