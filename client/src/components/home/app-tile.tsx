import { Loader2, Plus } from 'lucide-react';
import type { ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { useResolvedApp } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import type { AppRecord, SessionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';
import { UpdateBadge } from './update-badge';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  app: AppRecord;
  installed?: boolean;
  sessionStatus?: SessionStatus;
  pullProgress?: number | null;
  updateProgress?: number | null;
  updateAvailable?: boolean;
}

export const AppTile = forwardRef<HTMLButtonElement, Props>(function AppTile({ app, installed = true, sessionStatus, pullProgress, updateProgress, updateAvailable, className, ...rest }, ref) {
  const { t, i18n } = useTranslation();
  const [iconBroken, setIconBroken] = useState(false);
  const resolved = useResolvedApp(app);
  const iconUrl = resolved.iconUrl;
  const name = resolved.spec ? tr(resolved.spec, resolved.spec.name, i18n.language) : app.slug;
  const description = resolved.spec ? tr(resolved.spec, resolved.spec.description, i18n.language) : '';
  const showIcon = iconUrl && !iconBroken;

  if (!installed) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'group flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/20 bg-transparent p-2 text-muted-foreground transition',
          'sm:gap-3 sm:rounded-xl sm:p-6',
          'hover:scale-[1.02] hover:border-white/40 hover:text-foreground focus-visible:scale-[1.02] focus-visible:border-white/60 focus-visible:outline-none',
          'data-[focused=true]:scale-[1.02] data-[focused=true]:border-ring data-[focused=true]:text-foreground data-[focused=true]:outline-none',
          className,
        )}
        {...rest}
      >
        {showIcon ? (
          <img src={iconUrl} alt={name} onError={() => setIconBroken(true)} className="h-12 w-12 rounded-xl object-contain opacity-60 transition group-hover:opacity-100 sm:h-20 sm:w-20" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-white/20 text-xl font-bold opacity-60 transition group-hover:opacity-100 sm:h-20 sm:w-20 sm:text-3xl">{name.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="text-center">
          <div className="line-clamp-1 text-xs font-medium leading-tight sm:text-base">{name}</div>
          <div className="mt-1 hidden items-center gap-1 text-xs sm:inline-flex">
            <Plus className="h-3 w-3" /> {t('home.install')}
          </div>
        </div>
      </button>
    );
  }

  const isStarting = sessionStatus === 'starting';
  const isStopping = sessionStatus === 'stopping';
  const isUpdating = typeof updateProgress === 'number';
  const isBusy = isStarting || isStopping || isUpdating;
  const isPulling = isStarting && typeof pullProgress === 'number' && pullProgress >= 0 && pullProgress < 100;
  const showProgressBar = isUpdating || isPulling;
  const showSpinner = isStarting && !isPulling;

  let progressValue = 0;
  let progressLabel = '';
  if (isUpdating) {
    progressValue = updateProgress ?? 0;
    progressLabel = progressValue < 100 ? t('home.progress.updating', { percent: progressValue }) : t('home.progress.finishing');
  } else if (isPulling) {
    progressValue = pullProgress ?? 0;
    progressLabel = t('home.progress.downloading', { percent: progressValue });
  }

  const spinnerLabel = showSpinner ? (pullProgress === 100 ? t('home.progress.settingUp') : t('home.progress.starting')) : '';

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card p-2 text-card-foreground shadow-sm transition',
        'sm:gap-3 sm:rounded-xl sm:p-6',
        !isBusy && 'hover:-translate-y-1 hover:border-foreground/30 focus-visible:-translate-y-1 focus-visible:border-foreground/40 focus-visible:outline-none',
        !isBusy && 'data-[focused=true]:-translate-y-1 data-[focused=true]:border-transparent data-[focused=true]:outline-none data-[focused=true]:ring-2 data-[focused=true]:ring-inset data-[focused=true]:ring-ring',
        isBusy && 'opacity-70',
        className,
      )}
      {...rest}
    >
      {sessionStatus ? <StatusBadge status={sessionStatus} /> : null}
      {!sessionStatus && updateAvailable ? <UpdateBadge /> : null}

      {showIcon ? (
        <img src={iconUrl} alt={name} onError={() => setIconBroken(true)} className="h-12 w-12 rounded-xl object-contain sm:h-20 sm:w-20" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-xl font-bold text-muted-foreground sm:h-20 sm:w-20 sm:text-3xl">{name.slice(0, 1).toUpperCase()}</div>
      )}

      <div className="w-full text-center">
        <div className="line-clamp-1 text-xs font-medium leading-tight sm:text-base">{name}</div>
        {showProgressBar ? (
          <div className="mt-1 flex flex-col gap-1 sm:mt-2">
            <Progress value={progressValue} className="h-1 sm:h-2" />
            <div className="hidden text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums sm:block">{progressLabel}</div>
          </div>
        ) : showSpinner ? (
          <div className="mt-1 flex items-center justify-center gap-2 sm:mt-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground sm:h-4 sm:w-4" />
            <div className="hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:block">{spinnerLabel}</div>
          </div>
        ) : description ? (
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground max-sm:hidden">{description}</div>
        ) : null}
      </div>
    </button>
  );
});

// Radix's DropdownMenuTrigger opens the menu on ArrowDown by default. Spatial
// nav uses ArrowDown to move focus to the next card, so we preventDefault on
// arrow keys to keep them purely navigational — A/Enter (click) opens.
export function swallowArrowKeys(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
  }
}
