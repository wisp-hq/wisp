import { useMemo } from 'react';
import type { CatalogEntry } from '@/clients/catalog.client';
import { useCatalog } from '@/hooks/use-catalog';
import { findCatalogEntry, resolveIconUrl, resolveSpec } from '@/lib/effective-spec';
import type { AppRecord, AppSpec } from '@/lib/types';

export interface ResolvedApp {
  record: AppRecord;
  catalogEntry: CatalogEntry | undefined;
  spec: AppSpec | null;
  iconUrl: string;
}

export function resolveApp(app: AppRecord, catalog: CatalogEntry[]): ResolvedApp {
  const catalogEntry = findCatalogEntry(app, catalog);
  return {
    record: app,
    catalogEntry,
    spec: resolveSpec(app, catalogEntry),
    iconUrl: resolveIconUrl(app, catalogEntry),
  };
}

export function useResolvedApp(app: AppRecord | null | undefined): ResolvedApp | null {
  const { data: catalog = [] } = useCatalog();
  return useMemo(() => (app ? resolveApp(app, catalog) : null), [app, catalog]);
}

export function useResolvedApps(apps: AppRecord[]): ResolvedApp[] {
  const { data: catalog = [] } = useCatalog();
  return useMemo(() => apps.map((app) => resolveApp(app, catalog)), [apps, catalog]);
}
