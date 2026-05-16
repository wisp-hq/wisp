import type { CatalogEntry } from '@/clients/catalog.client';
import type { AppOverrides, AppRecord, AppSpec, Volume } from '@/lib/types';

export function isCatalogApp(app: Pick<AppRecord, 'catalogSource'>): boolean {
  return !!app.catalogSource;
}

export function mergeVolumes(base: Volume[] | undefined, overrides: Volume[] | undefined): Volume[] | undefined {
  if (!base && !overrides) {
    return undefined;
  }

  const map = new Map<string, Volume>();
  for (const v of base ?? []) {
    map.set(v.id, v);
  }
  for (const v of overrides ?? []) {
    map.set(v.id, v);
  }
  return Array.from(map.values());
}

export function resolveSpec(app: AppRecord, catalogEntry: CatalogEntry | undefined): AppSpec | null {
  if (!isCatalogApp(app)) {
    return app.spec as AppSpec;
  }

  if (!catalogEntry) {
    return null;
  }

  const overrides = app.spec as AppOverrides;
  const base = catalogEntry.spec;

  return {
    ...base,
    container: {
      image: overrides.container?.image ?? base.container.image,
      env: { ...(base.container.env ?? {}), ...(overrides.container?.env ?? {}) },
    },
    volumes: mergeVolumes(base.volumes, overrides.volumes),
    features: { ...(base.features ?? {}), ...(overrides.features ?? {}) },
  };
}

export function resolveIconUrl(app: AppRecord, catalogEntry: CatalogEntry | undefined): string {
  if (catalogEntry) {
    return catalogEntry.iconUrl;
  }

  const spec = app.spec as AppSpec;
  if (!spec.icon) {
    return '';
  }

  if (spec.icon.startsWith('http://') || spec.icon.startsWith('https://') || spec.icon.startsWith('data:') || spec.icon.startsWith('/')) {
    return spec.icon;
  }

  return '';
}

export function findCatalogEntry(app: Pick<AppRecord, 'slug' | 'catalogSource'>, catalog: CatalogEntry[]): CatalogEntry | undefined {
  if (!app.catalogSource) {
    return undefined;
  }

  return catalog.find((entry) => entry.slug === app.slug && entry.catalogSource === app.catalogSource);
}
