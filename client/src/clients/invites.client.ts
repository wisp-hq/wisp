import { type HttpDelegate, universalClient, withFetchDelegate, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';

export interface InviteResponse {
  token: string;
  path: string;
}

export interface InviteLookupResponse {
  sessionId: string;
  app: string;
}

const sessionsClient = universalClient(
  withAuthFetchDelegate('/api/sessions'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    getInvite: (sessionId: string) => delegate.get<InviteResponse>(`/${sessionId}/invite`),
    rotateInvite: (sessionId: string) => delegate.post<InviteResponse>(`/${sessionId}/invite/rotate`, {}),
  })),
);

const invitesClient = universalClient(
  withFetchDelegate('/api/invites'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    lookupInvite: (token: string) => delegate.get<InviteLookupResponse>(`/${token}`),
  })),
);

export const { getInvite, rotateInvite } = sessionsClient;
export const { lookupInvite } = invitesClient;
