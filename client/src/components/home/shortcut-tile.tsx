import { Check, EyeOff, Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pickShortcutIcon } from '@/lib/shortcut-icon';
import type { AppShortcutRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useUser } from '@/providers/auth-provider';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  shortcut: AppShortcutRecord;
  appName: string;
  source: string;
  isStartPending?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
}

// Cover art URLs to try in order if the shortcut's primary iconUrl fails. Steam
// mints `library_600x900.jpg` only after a store page goes live; unreleased
// titles (Pragmata, early-access pre-launch builds, etc.) need progressively
// smaller assets to land on one that exists.
function fallbackIconUrls(source: string, externalId: string): string[] {
  if (source === 'steam') {
    const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${externalId}`;
    return [`${base}/library_hero.jpg`, `${base}/header.jpg`, `${base}/capsule_main.jpg`, `${base}/capsule_231x87.jpg`];
  }

  return [];
}

export const ShortcutTile = forwardRef<HTMLButtonElement, Props>(function ShortcutTile({ shortcut, appName, source, isStartPending = false, selectionMode = false, selected = false, className, ...rest }, ref) {
  const { t } = useTranslation();
  const user = useUser();
  const [fallbackIndex, setFallbackIndex] = useState(-1);

  const primaryUrl = pickShortcutIcon(shortcut.iconUrls, user.region);
  const fallbacks = fallbackIconUrls(source, shortcut.externalId);
  const currentUrl = fallbackIndex === -1 ? primaryUrl : (fallbacks[fallbackIndex] ?? null);

  const handleError = () => {
    setFallbackIndex((idx) => idx + 1);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm transition',
        'aspect-[2/3] sm:rounded-xl',
        !isStartPending && !selectionMode && 'hover:-translate-y-1 hover:border-foreground/30 focus-visible:-translate-y-1 focus-visible:border-foreground/40 focus-visible:outline-none',
        !isStartPending && !selectionMode && 'data-[focused=true]:-translate-y-1 data-[focused=true]:border-transparent data-[focused=true]:outline-none data-[focused=true]:ring-2 data-[focused=true]:ring-inset data-[focused=true]:ring-ring',
        isStartPending && 'opacity-70',
        shortcut.hidden && !selectionMode && 'opacity-50',
        selectionMode && selected && 'border-foreground ring-2 ring-foreground ring-inset',
        className,
      )}
      {...rest}
    >
      {currentUrl ? (
        <img src={currentUrl} alt={shortcut.name} onError={handleError} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-3xl font-bold text-muted-foreground">{shortcut.name.slice(0, 1).toUpperCase()}</div>
      )}

      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">{appName}</span>

      {shortcut.hidden && !selectionMode ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
          <EyeOff className="h-3 w-3" />
        </span>
      ) : null}

      {selectionMode ? (
        <span className={cn('absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border', selected ? 'border-foreground bg-foreground text-background' : 'border-white/70 bg-black/40 text-transparent')}>
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 sm:p-3">
        <div className="line-clamp-2 text-left text-xs font-medium leading-tight text-white sm:text-sm">{shortcut.name}</div>
        {isStartPending ? (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/80">
            <Loader2 className="h-3 w-3 animate-spin" /> {t('home.progress.starting')}
          </div>
        ) : null}
      </div>
    </button>
  );
});
