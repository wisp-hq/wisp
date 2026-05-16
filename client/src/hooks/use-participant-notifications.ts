import { useLiveQuery } from '@tanstack/react-db';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { sessionParticipantsCollection } from '@/collections';
import type { SessionParticipantRecord } from '@/lib/types';

function postToast(message: string, kind: 'success' | 'error' | 'info' | 'warning') {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({ type: 'hud:toast', message, kind }, window.location.origin);
}

export function useParticipantNotifications(sessionId: string, enabled: boolean): void {
  const { t } = useTranslation();
  const { data: allParticipants = [] } = useLiveQuery((q) => q.from({ p: sessionParticipantsCollection }));
  const prevRef = useRef<Map<string, SessionParticipantRecord> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const current = new Map<string, SessionParticipantRecord>();
    for (const p of allParticipants) {
      if (p.session === sessionId) {
        current.set(p.id, p);
      }
    }

    const prev = prevRef.current;
    prevRef.current = current;

    if (prev === null) {
      return;
    }

    const guestName = t('hud.overlay.sharing.guestName');

    for (const [id, p] of current) {
      if (!p.revokedAt && !prev.has(id)) {
        postToast(t('hud.overlay.sharing.joinedToast', { name: p.displayName || guestName }), 'success');
      }
    }

    for (const [id, p] of prev) {
      if (p.revokedAt) {
        continue;
      }

      const now = current.get(id);
      if (!now || now.revokedAt) {
        postToast(t('hud.overlay.sharing.leftToast', { name: p.displayName || guestName }), 'error');
      }
    }
  }, [allParticipants, sessionId, enabled, t]);
}
