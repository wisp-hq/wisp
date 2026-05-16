import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteApp } from '@/mutations/apps';
import { AppActionItem } from './app-action-item';

interface MenuItemProps {
  onSelect: () => void;
}

export function RemoveAppMenuItem({ onSelect }: MenuItemProps) {
  const { t } = useTranslation();
  return <AppActionItem icon={<Trash2 />} label={t('home.remove')} destructive onSelect={onSelect} />;
}

interface DialogProps {
  appId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveAppDialog({ appId, appName, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('home.removeConfirmTitle', { appName })}</DialogTitle>
          <DialogDescription>{t('home.removeConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              deleteApp(appId);
              onOpenChange(false);
            }}
          >
            {t('home.removeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
