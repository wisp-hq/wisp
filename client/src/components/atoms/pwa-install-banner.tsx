import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/lib/use-pwa-install';

const DISMISS_KEY = 'wisp:pwa-install-dismissed-at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readDismissed(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) {
    return false;
  }

  const ts = Number(raw);
  if (!Number.isFinite(ts)) {
    return false;
  }

  return Date.now() - ts < DISMISS_TTL_MS;
}

export function PwaInstallBanner() {
  const { t } = useTranslation();
  const status = usePwaInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (status.state === 'installed') {
      localStorage.removeItem(DISMISS_KEY);
    }
  }, [status.state]);

  if (dismissed) {
    return null;
  }

  if (status.state === 'installed' || status.state === 'unsupported') {
    return null;
  }

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/hud/')) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const onInstall = async () => {
    if (status.state === 'prompt') {
      const outcome = await status.prompt();
      if (outcome === 'dismissed') {
        dismiss();
      }
    } else {
      setIosOpen((v) => !v);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:hidden">
      <div className="mx-auto max-w-md rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('pwa.installTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('pwa.installDescription')}</p>
            {iosOpen ? (
              <div className="mt-2 space-y-1 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  1. <Share className="h-3.5 w-3.5" /> {t('pwa.iosStep1')}
                </p>
                <p className="flex items-center gap-1.5">
                  2. <SquarePlus className="h-3.5 w-3.5" /> {t('pwa.iosStep2')}
                </p>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={dismiss} aria-label={t('pwa.close')} className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onInstall}>
            {status.state === 'prompt' ? t('pwa.install') : iosOpen ? t('pwa.hide') : t('pwa.howToInstall')}
          </Button>
        </div>
      </div>
    </div>
  );
}
