import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { type PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CatalogSourceInfo, listCatalogSources } from '@/clients/catalog.client';
import { catalogSourcesCollection } from '@/collections';
import { pb } from '@/lib/pb';
import type { CatalogSourceRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

const BUILTIN_NAME = 'wisp-hq/apps';
const BUILTIN_URL = 'https://github.com/wisp-hq/apps';
const BUILTIN_ID = 'builtin';

export function CatalogSourcesDialog({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { data: sources = [] } = useLiveQuery((q) => q.from({ s: catalogSourcesCollection }));
  const { data: meta = [] } = useQuery<CatalogSourceInfo[]>({
    queryKey: ['catalog-sources-meta'],
    queryFn: ({ signal }) => listCatalogSources(signal),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const metaById = new Map(meta.map((m) => [m.id, m]));
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedUrl = url.trim();
    const trimmedName = name.trim();
    if (!trimmedUrl || !trimmedName) {
      setError(t('catalogSources.errors.missingFields'));
      return;
    }

    setAdding(true);
    try {
      await pb.collection<CatalogSourceRecord>('catalog_sources').create({ url: trimmedUrl, name: trimmedName, enabled: true });
      setUrl('');
      setName('');
    } catch (err) {
      setError((err as Error).message || t('catalogSources.errors.addFailed'));
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(s: CatalogSourceRecord, enabled: boolean) {
    setBusyId(s.id);
    try {
      await pb.collection<CatalogSourceRecord>('catalog_sources').update(s.id, { enabled });
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(id: string) {
    catalogSourcesCollection.delete(id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('catalogSources.title')}</DialogTitle>
          <DialogDescription>{t('catalogSources.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ul className="space-y-1">
            <SourceRow name={BUILTIN_NAME} url={BUILTIN_URL} info={metaById.get(BUILTIN_ID)} locked />
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                name={s.name}
                url={s.url}
                info={metaById.get(s.id)}
                enabled={s.enabled}
                onToggle={(checked) => handleToggle(s, checked)}
                onDelete={() => handleDelete(s.id)}
                busy={busyId === s.id}
                toggleAriaLabel={t(s.enabled ? 'catalogSources.disableAria' : 'catalogSources.enableAria', { name: s.name })}
                removeAriaLabel={t('catalogSources.removeAria', { name: s.name })}
              />
            ))}
          </ul>

          <form onSubmit={handleAdd} className="space-y-3 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="source-url">{t('catalogSources.urlLabel')}</Label>
              <Input id="source-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" spellCheck={false} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source-name">{t('catalogSources.nameLabel')}</Label>
              <Input id="source-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('catalogSources.namePlaceholder')} />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <Button type="submit" disabled={adding} className="w-full">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? t('catalogSources.adding') : t('catalogSources.add')}
            </Button>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SourceRowProps {
  name: string;
  url: string;
  info?: CatalogSourceInfo;
  locked?: boolean;
  enabled?: boolean;
  busy?: boolean;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  toggleAriaLabel?: string;
  removeAriaLabel?: string;
}

function SourceRow({ name, url, info, locked = false, enabled = true, busy = false, onToggle, onDelete, toggleAriaLabel, removeAriaLabel }: SourceRowProps) {
  const { t } = useTranslation();
  const dimmed = !locked && !enabled;
  const upstreamName = info?.manifestName?.trim();
  const description = info?.description?.trim();
  const homepage = info?.homepage?.trim();
  const fetchError = info?.fetchError?.trim();
  const appsCount = info?.apps?.length ?? 0;

  return (
    <li className={cn('flex flex-col gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm', dimmed && 'opacity-60')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{upstreamName || name}</span>
            {locked ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
            {fetchError ? <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" /> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">{url}</div>
          {description ? <p className="mt-1 text-xs text-muted-foreground/80">{description}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/70">
            {homepage ? (
              <a href={homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <ExternalLink className="h-3 w-3" />
                {t('catalogSources.homepage')}
              </a>
            ) : null}
            {appsCount > 0 ? <span>{t('catalogSources.appsCount', { count: appsCount })}</span> : null}
            {fetchError ? <span className="text-destructive">{fetchError}</span> : null}
          </div>
        </div>
        {!locked ? (
          <>
            <Switch checked={enabled} disabled={busy} onCheckedChange={(checked) => onToggle?.(checked)} aria-label={toggleAriaLabel} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={onDelete} aria-label={removeAriaLabel}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}
