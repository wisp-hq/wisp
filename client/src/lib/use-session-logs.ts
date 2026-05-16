import { useEffect, useState } from 'react';
import { pb } from './pb';

const MAX_LINES = 2000;

export function useSessionLogs(sessionId: string | null): { lines: string[]; connected: boolean } {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setLines([]);
      setConnected(false);
      return;
    }

    setLines([]);
    setConnected(false);
    const token = pb.authStore.token;
    if (!token) {
      return;
    }

    const url = `/api/sessions/${sessionId}/logs?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice();
        next.push(ev.data);
        return next;
      });
    };
    return () => es.close();
  }, [sessionId]);

  return { lines, connected };
}
