import { useState, useEffect, useRef, useCallback } from 'react';
import {
  WsConnectionStatus,
  WsOutgoing,
  WsIncoming,
  CachedDeviceState,
  DeviceUpdate,
} from '../types/devices';

interface UseWebSocketOptions {
  wsToken: string | null;
  onFullState: (state: CachedDeviceState) => void;
  onDeviceUpdates: (updates: DeviceUpdate[]) => void;
}

export function useWebSocket({ wsToken, onFullState, onDeviceUpdates }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WsConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const mountedRef = useRef(true);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const send = useCallback((msg: WsOutgoing) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!wsToken || !mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      // Authenticate immediately after connecting
      ws.send(JSON.stringify({ type: 'auth', token: wsToken } satisfies WsOutgoing));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      let msg: WsIncoming;
      try {
        msg = JSON.parse(event.data as string) as WsIncoming;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'authOk':
          setStatus('connected');
          reconnectDelayRef.current = 1000;
          break;
        case 'fullState':
          onFullState(msg.payload);
          break;
        case 'deviceUpdates':
          onDeviceUpdates(msg.payload);
          break;
        case 'error':
          console.warn('[WS] Server error:', msg.payload);
          break;
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30_000);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setStatus('reconnecting');
          connect();
        }
      }, delay);
    };

    ws.onerror = () => {
      // onclose fires right after onerror, handles reconnect
    };
  }, [wsToken, onFullState, onDeviceUpdates]);

  useEffect(() => {
    mountedRef.current = true;
    if (wsToken) connect();

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsToken, connect]);

  return { status, send };
}
