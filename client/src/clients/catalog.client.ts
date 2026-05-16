import { type HttpDelegate, universalClient, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';
import type { AppSpec } from '@/lib/types';

export interface CatalogEntry {
  slug: string;
  catalogSource: string;
  catalogPath: string;
  source: string;
  iconUrl: string;
  spec: AppSpec;
}

export interface CatalogSourceInfo {
  id: string;
  url: string;
  localName: string;
  enabled: boolean;
  manifestName?: string;
  description?: string;
  homepage?: string;
  apps?: string[];
  fetchError?: string;
}

const catalogClient = universalClient(
  withAuthFetchDelegate('/api/catalog'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    list: (signal?: AbortSignal) => delegate.get<CatalogEntry[]>('', { signal }),
    listSources: (signal?: AbortSignal) => delegate.get<CatalogSourceInfo[]>('/sources', { signal }),
  })),
);

export const { list: listCatalog, listSources: listCatalogSources } = catalogClient;
