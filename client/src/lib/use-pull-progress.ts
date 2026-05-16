import { useEffect, useState } from 'react';
import { pb } from './pb';

// Subscribes to a launcher SSE pull-progress stream (sessions or apps). Returns
// `null` until the first event arrives (no progress yet, or no pull at all).
// The auth token is appended as a query param because EventSource doesn't
// support custom headers.
function useProgress(path: string | null): number | null {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!path) {
      setProgress(null);
      return;
    }

    setProgress(null);
    const token = pb.authStore.token;
    if (!token) {
      return;
    }

    const url = `${path}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      const n = Number(ev.data);
      if (Number.isFinite(n)) {
        setProgress(n);
      }
    };
    return () => es.close();
  }, [path]);

  return progress;
}

export function usePullProgress(sessionId: string | null): number | null {
  return useProgress(sessionId ? `/api/sessions/${sessionId}/progress` : null);
}

export function useAppUpdateProgress(appId: string | null): number | null {
  return useProgress(appId ? `/api/apps/${appId}/progress` : null);
}
