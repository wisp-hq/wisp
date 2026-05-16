import { Home, Keyboard, Loader2, LogOut, Maximize2, Minimize2, Power, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResolvedApp } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import type { SelkiesBridge } from '@/lib/selkies-bridge';
import type { AppRecord, SessionRecord } from '@/lib/types';
import { useIsFullscreen } from '@/lib/use-fullscreen';
import { PanelFrame } from './panel-frame';
import { PreferencesTabs } from './preferences-tabs';
import { StatsPanel } from './stats-panel';

interface Props {
  app: AppRecord | null;
  session: SessionRecord | null;
  sessionId: string;
  isOwner: boolean;
  bridge: SelkiesBridge;
  onClose: () => void;
  onGoHome: () => void;
  onQuit: () => void;
  onFullscreen: () => void;
  quitPending: boolean;
}

export function HudPanel({ app, session, sessionId, isOwner, bridge, onClose, onGoHome, onQuit, onFullscreen, quitPending }: Props) {
  const { t, i18n } = useTranslation();
  const [confirmQuit, setConfirmQuit] = useState(false);
  const isFullscreen = useIsFullscreen();
  const fullscreenLabel = String(isFullscreen ? t('hud.overlay.actions.exitFullscreen') : t('hud.overlay.actions.fullscreen'));
  const hasTouchInput = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

  const resolved = useResolvedApp(app);
  const appLabel = resolved?.spec ? tr(resolved.spec, resolved.spec.name, i18n.language) : 'Session';
  const iconUrl = resolved?.iconUrl ?? '';

  const header = (
    <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-4">
      {iconUrl ? <img src={iconUrl} alt="" className="h-8 w-8 rounded-lg object-contain sm:h-10 sm:w-10" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground sm:h-10 sm:w-10 sm:text-base">{appLabel.slice(0, 1).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{appLabel}</div>
        <div className="truncate text-xs text-muted-foreground">{session?.status === 'ready' ? t('hud.overlay.running') : (session?.status ?? '—')}</div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button variant="ghost" size="icon" onClick={onGoHome} aria-label={t('hud.overlay.actions.home')} title={t('hud.overlay.actions.home')}>
          <Home className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onFullscreen} aria-label={fullscreenLabel} title={fullscreenLabel}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        {hasTouchInput ? (
          <Button variant="ghost" size="icon" onClick={() => bridge.showVirtualKeyboard()} aria-label={t('hud.overlay.actions.virtualKeyboard')} title={t('hud.overlay.actions.virtualKeyboard')}>
            <Keyboard className="h-4 w-4" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={() => bridge.restartVideo()} aria-label={t('hud.overlay.restartStream')} title={t('hud.overlay.restartStream')}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (isOwner ? setConfirmQuit(true) : onQuit())}
          disabled={quitPending}
          aria-label={isOwner ? t('hud.overlay.actions.stop') : t('hud.overlay.actions.leave')}
          title={isOwner ? t('hud.overlay.actions.stop') : t('hud.overlay.actions.leave')}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {quitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isOwner ? <Power className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        </Button>
        <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('hud.overlay.close')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const appLabelForConfirm = appLabel;

  return (
    <div className="fixed inset-0 flex flex-col items-stretch justify-stretch md:items-center md:justify-center md:p-4 lg:p-8">
      <button type="button" aria-label={t('hud.overlay.closeMenu')} onClick={onClose} className="absolute inset-0 hidden cursor-default bg-black/60 md:block" />
      <div className="relative z-10 flex h-full w-full flex-col md:h-auto md:max-w-5xl">
        <PanelFrame header={header} rightPanel={<StatsPanel bridge={bridge} />}>
          <PreferencesTabs sessionId={sessionId} isOwner={isOwner} bridge={bridge} />
        </PanelFrame>
      </div>

      <Dialog open={confirmQuit} onOpenChange={setConfirmQuit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('home.stopConfirmTitle', { appName: appLabelForConfirm })}</DialogTitle>
            <DialogDescription>{t('home.stopConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmQuit(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmQuit(false);
                onQuit();
              }}
            >
              {t('home.stopConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
