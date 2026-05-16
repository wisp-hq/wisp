import { Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stopSession } from '@/clients/sessions.client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppActionItem } from './app-action-item';

interface MenuItemProps {
  onSelect: () => void;
}

export function StopSessionMenuItem({ onSelect }: MenuItemProps) {
  const { t } = useTranslation();
  return <AppActionItem icon={<Square />} label={t('home.stop')} destructive onSelect={onSelect} />;
}

interface DialogProps {
  sessionId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StopSessionDialog({ sessionId, appName, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('home.stopConfirmTitle', { appName })}</DialogTitle>
          <DialogDescription>{t('home.stopConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void stopSession(sessionId);
              onOpenChange(false);
            }}
          >
            {t('home.stopConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
