import { type HttpDelegate, universalClient, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';

interface AppActionResponse {
  ok: boolean;
}

const appsClient = universalClient(
  withAuthFetchDelegate('/api/apps'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    triggerAppUpdate: (appId: string) => delegate.post<AppActionResponse>(`/${appId}/update`, {}),
  })),
);

export const { triggerAppUpdate } = appsClient;
