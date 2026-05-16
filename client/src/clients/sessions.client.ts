import { type HttpDelegate, universalClient, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';
import type { SessionStatus } from '@/lib/types';

interface SessionResponse {
  id: string;
  status: SessionStatus;
  url: string;
  app: string;
}

export type CreateSessionPayload = { appId: string } | { shortcutId: string };

const sessionsClient = universalClient(
  withAuthFetchDelegate('/api/sessions'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    createSession: (payload: CreateSessionPayload) => delegate.post<SessionResponse>('', payload),
    stopSession: (id: string) => delegate.post<{ ok: boolean }>(`/${id}/stop`, {}),
  })),
);

export const { createSession, stopSession } = sessionsClient;
