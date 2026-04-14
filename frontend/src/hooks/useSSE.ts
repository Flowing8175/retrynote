import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/api/createApiClient';

export type SSEStatus = 'connecting' | 'connected' | 'error' | 'closed';

export interface SSEOptions {
  onMessage?: (data: unknown) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  enabled?: boolean;
}

export interface SSEResult {
  status: SSEStatus;
  lastMessage: unknown;
  error: string | null;
  close: () => void;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export function useSSE(url: string, options: SSEOptions = {}): SSEResult {
  const { onMessage, onError, onDone, enabled = true } = options;

  const [sseStatus, setSseStatus] = useState<SSEStatus>('connecting');
  const [lastMessage, setLastMessage] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedManuallyRef = useRef(false);

  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onDoneRef = useRef(onDone);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  onDoneRef.current = onDone;

  const cleanup = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    closedManuallyRef.current = true;
    cleanup();
    setSseStatus('closed');
  }, [cleanup]);

  useEffect(() => {
    if (!enabled) return;

    closedManuallyRef.current = false;
    retryCountRef.current = 0;

    function connect() {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        setSseStatus('error');
        setError('No auth token available');
        return;
      }

      const separator = url.includes('?') ? '&' : '?';
      const fullUrl = `${API_BASE_URL}${url}${separator}token=${encodeURIComponent(token)}`;
      setSseStatus('connecting');

      const es = new EventSource(fullUrl);
      esRef.current = es;

      es.onopen = () => {
        retryCountRef.current = 0;
        setSseStatus('connected');
        setError(null);
      };

      es.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as unknown;
          setLastMessage(data);
          onMessageRef.current?.(data);
        } catch {
          setLastMessage(event.data);
          onMessageRef.current?.(event.data);
        }
      };

      es.addEventListener('error', (event: Event) => {
        if (event instanceof MessageEvent) {
          let errMsg = 'SSE stream error';
          try {
            const parsed = JSON.parse(event.data as string) as { message?: string };
            errMsg = parsed.message ?? errMsg;
          } catch {
            if (typeof event.data === 'string') errMsg = event.data;
          }
          setError(errMsg);
          setSseStatus('error');
          onErrorRef.current?.(errMsg);
          return;
        }

        if (closedManuallyRef.current) return;
        cleanup();

        if (retryCountRef.current < MAX_RETRIES) {
          const delay = BACKOFF_BASE_MS * 2 ** retryCountRef.current;
          retryCountRef.current += 1;
          setSseStatus('connecting');
          retryTimerRef.current = setTimeout(connect, delay);
        } else {
          const msg = 'Connection failed after maximum retries';
          setSseStatus('error');
          setError(msg);
          onErrorRef.current?.(msg);
        }
      });

      es.addEventListener('done', () => {
        setSseStatus('closed');
        onDoneRef.current?.();
        cleanup();
      });
    }

    connect();

    return () => {
      closedManuallyRef.current = true;
      cleanup();
    };
  }, [url, enabled, cleanup]);

  return { status: sseStatus, lastMessage, error, close };
}
