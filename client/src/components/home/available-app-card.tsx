import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '@/clients/catalog.client';
import type { AppRecord } from '@/lib/types';
import { AppTile, swallowArrowKeys } from './app-tile';

interface Props {
  entry: CatalogEntry;
  onInstall: () => void;
}

export function AvailableAppCard({ entry, onInstall }: Props) {
  const { t } = useTranslation();
  const { ref: focusRef, focused } = useFocusable<HTMLButtonElement>({ focusKey: `catalog-${entry.slug}` });
  const placeholderApp: AppRecord = {
    id: entry.slug,
    collectionId: '',
    collectionName: '',
    created: '',
    updated: '',
    slug: entry.slug,
    catalogSource: entry.catalogSource,
    version: entry.spec.version,
    spec: entry.spec,
    state: null,
    dismissedVersion: '',
  };

  return (
    <div className="relative">
      <AppTile ref={focusRef} data-focused={focused || undefined} app={placeholderApp} installed={false} onClick={onInstall} onKeyDown={swallowArrowKeys} />
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{t('install.presetBadge')}</span>
    </div>
  );
}
