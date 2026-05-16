import { useLiveQuery } from '@tanstack/react-db';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CreateSessionPayload, createSession } from '@/clients/sessions.client';
import { sessionsCollection } from '@/collections';

export type LaunchError = {
  title: string;
  details: string | null;
};

const KNOWN_CODES = new Set(['build_binds', 'pull_image', 'spawn', 'inspect_ip', 'wait_healthy', 'wait_websocket']);

export function useLaunchSession() {
  const { t } = useTranslation();
  const [pendingLaunchId, setPendingLaunchId] = useState<string | null>(null);
  const [error, setError] = useState<LaunchError | null>(null);

  const { data: sessions = [] } = useLiveQuery((q) => q.from({ s: sessionsCollection }));
  const pendingSession = pendingLaunchId ? sessions.find((s) => s.id === pendingLaunchId) : null;

  useEffect(() => {
    if (!pendingSession) {
      return;
    }

    if (pendingSession.status === 'ready') {
      window.location.href = `/s/${pendingSession.id}/`;
      return;
    }

    if (pendingSession.status === 'failed') {
      const code = pendingSession.failureCode;
      const reason = pendingSession.failureReason;
      const title = KNOWN_CODES.has(code) ? t(`home.errors.${code}`) : t('home.failedToStart');
      setError({ title, details: reason || null });
      setPendingLaunchId(null);
    }
  }, [pendingSession, t]);

  const mutation = useMutation({
    mutationFn: (payload: CreateSessionPayload) => createSession(payload),
    onSuccess: (resp) => {
      if (resp.status === 'ready') {
        window.location.href = resp.url;
        return;
      }

      setPendingLaunchId(resp.id);
    },
    onError: (err) => setError({ title: err instanceof Error ? err.message : String(err), details: null }),
  });

  const launchApp = (appId: string) => mutation.mutate({ appId });
  const launchShortcut = (shortcutId: string) => mutation.mutate({ shortcutId });

  const pendingPayload = mutation.isPending ? mutation.variables : null;

  return {
    launch: launchApp,
    launchShortcut,
    cancelLaunch: () => setPendingLaunchId(null),
    pendingAppId: pendingPayload && 'appId' in pendingPayload ? pendingPayload.appId : null,
    pendingShortcutId: pendingPayload && 'shortcutId' in pendingPayload ? pendingPayload.shortcutId : null,
    error,
    dismissError: () => setError(null),
  };
}
