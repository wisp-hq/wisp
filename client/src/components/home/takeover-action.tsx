import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppActionItem } from './app-action-item';

// session.updated is bumped every minute while a WS is open (proxy keepTouching)
// and flushed on a 60 s cleanup tick. >2 min stale ⇒ nobody is actively connected,
// so we skip the takeover prompt and just open the session.
const STALE_AFTER_MS = 120_000;

// useSession.goHome() sets `wisp:left:<id>` in localStorage on intentional exit.
// We trust that flag within this window so users who just pressed Home don't
// get a takeover prompt for the session they just left.
const SELF_LEFT_GRACE_MS = 60_000;

interface MenuItemProps {
  sessionId: string;
  updated: string;
  onRequestTakeover: () => void;
}

export function TakeoverMenuItem({ sessionId, updated, onRequestTakeover }: MenuItemProps) {
  const { t } = useTranslation();

  const handleSelect = () => {
    const leftAt = Number.parseInt(localStorage.getItem(`wisp:left:${sessionId}`) || '0', 10);
    const selfLeft = Number.isFinite(leftAt) && leftAt > 0 && Date.now() - leftAt < SELF_LEFT_GRACE_MS;

    const lastSeen = new Date(updated).getTime();
    const isLikelyConnected = Number.isFinite(lastSeen) && Date.now() - lastSeen < STALE_AFTER_MS;

    if (selfLeft || !isLikelyConnected) {
      localStorage.removeItem(`wisp:left:${sessionId}`);
      window.location.href = `/s/${sessionId}/`;
      return;
    }

    onRequestTakeover();
  };

  return <AppActionItem icon={<MonitorPlay />} label={t('home.open')} onSelect={handleSelect} />;
}

interface DialogProps {
  sessionId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TakeoverDialog({ sessionId, appName, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('home.takeoverTitle')}</DialogTitle>
          <DialogDescription>{t('home.takeoverDescription', { appName })}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-wrap">
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = `/s/${sessionId}/#display2`;
            }}
          >
            {t('home.takeoverSecondScreen')}
          </Button>
          <Button
            onClick={() => {
              window.location.href = `/s/${sessionId}/`;
            }}
          >
            {t('home.takeoverConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
