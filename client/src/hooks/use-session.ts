import { useLiveQuery } from '@tanstack/react-db';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { leaveSession } from '@/clients/participants.client';
import { stopSession } from '@/clients/sessions.client';
import { appsCollection, sessionsCollection } from '@/collections';
import { pb } from '@/lib/pb';
import type { AppRecord, SessionRecord } from '@/lib/types';

export function useSession(sessionId: string): {
  session: SessionRecord | null;
  app: AppRecord | null;
  isOwner: boolean;
  quit: () => void;
  quitPending: boolean;
  goHome: () => void;
  requestFullscreen: () => void;
} {
  const { data: sessions = [], isLoading } = useLiveQuery((q) => q.from({ s: sessionsCollection }));
  const { data: apps = [] } = useLiveQuery((q) => q.from({ a: appsCollection }));

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const app = session ? (apps.find((a) => a.id === session.app) ?? null) : null;
  const isOwner = !!session && !!pb.authStore.record && pb.authStore.record.id === session.user;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    // Guests don't have PocketBase auth, so sessionsCollection returns nothing for them —
    // can't infer session liveness from here. The disconnectScript in the launcher proxy
    // already handles their "session ended" path via the Selkies WebSocket close.
    if (!pb.authStore.isValid) {
      return;
    }

    if (!session || session.status === 'stopping' || session.status === 'failed') {
      window.parent.location.replace('/');
    }
  }, [isLoading, session]);

  const quitMutation = useMutation({
    mutationFn: () => {
      if (isOwner) {
        return stopSession(sessionId);
      }

      let participantToken = '';
      try {
        participantToken = window.parent.localStorage.getItem(`wisp:participant:${sessionId}`) ?? '';
        window.parent.localStorage.removeItem(`wisp:participant:${sessionId}`);
      } catch {}
      return leaveSession(participantToken);
    },
    onSettled: () => {
      window.parent.location.replace('/');
    },
  });

  const goHome = useCallback(() => {
    // session.updated was just bumped by the proxy's keepTouching tick, so the
    // takeover dialog would treat the session as "actively connected" for ~2min
    // after we leave. Mark our intentional exit so the home page skips the
    // resume prompt — we know nobody is on this session right now.
    try {
      window.parent.localStorage.setItem(`wisp:left:${sessionId}`, String(Date.now()));
    } catch {}
    window.parent.location.replace('/');
  }, [sessionId]);

  const requestFullscreen = useCallback(() => {
    window.parent.postMessage({ type: 'hud:fullscreen' }, window.location.origin);
  }, []);

  return {
    session,
    app,
    isOwner,
    quit: quitMutation.mutate,
    quitPending: quitMutation.isPending,
    goHome,
    requestFullscreen,
  };
}
