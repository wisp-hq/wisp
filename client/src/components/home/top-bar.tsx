import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sessionsCollection } from '@/collections';
import { ProfileMenu } from '../auth/profile-menu';

export function TopBar() {
  const { t } = useTranslation();
  const { data: sessions = [] } = useLiveQuery((q) => q.from({ s: sessionsCollection }));

  const activeCount = useMemo(() => sessions.filter((s) => s.status === 'starting' || s.status === 'ready' || s.status === 'stopping').length, [sessions]);

  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3">
      <div className="flex items-center gap-2 rounded-md outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background">
        <img src="/wisp.svg" alt="" className="h-8 w-8 rounded-md sm:h-9 sm:w-9" />
        <span className="hidden text-lg font-semibold tracking-tight sm:inline">Wisp</span>
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center gap-2 rounded-full border bg-muted/60 px-2.5 py-1 text-sm sm:px-3 sm:py-1.5" role="status" aria-label={t('home.runningPlural', { count: activeCount })}>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium tabular-nums">{activeCount}</span>
          <span className="hidden text-muted-foreground sm:inline">{t('home.running')}</span>
        </div>
      ) : null}

      <ProfileMenu />
    </header>
  );
}
