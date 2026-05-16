import { type HttpDelegate, universalClient, withFetchDelegate, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';
import type { ParticipantRole } from '@/lib/types';

export interface ParticipantResponse {
  id: string;
  role: ParticipantRole;
  displayName: string;
  user: string;
  slot: number;
  lastSeenAt: string;
  created: string;
}

export interface ClaimResponse {
  sessionId: string;
  participantToken: string;
}

const sessionsClient = universalClient(
  withAuthFetchDelegate('/api/sessions'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    listParticipants: (sessionId: string) => delegate.get<ParticipantResponse[]>(`/${sessionId}/participants`),
    revokeParticipant: (sessionId: string, participantId: string) => delegate.delete<{ ok: boolean }>(`/${sessionId}/participants/${participantId}`),
  })),
);

const participantsClient = universalClient(
  withFetchDelegate('/api/participants'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    claimParticipant: (inviteToken: string, displayName: string) => delegate.post<ClaimResponse>('/claim', { inviteToken, displayName }),
    leaveSession: (participantToken: string) => delegate.post<{ ok: boolean }>('/leave', { participantToken }),
  })),
);

export const { listParticipants, revokeParticipant } = sessionsClient;
export const { claimParticipant, leaveSession } = participantsClient;
