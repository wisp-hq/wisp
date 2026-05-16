import { MonitorCog, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { PanelFrame } from '@/components/hud/panel-frame';
import { PreferencesTabs } from '@/components/hud/preferences-tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HudPreferencesDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const title = t('hud.preferences.title');
  const description = t('hud.preferences.description');

  const header = (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <MonitorCog className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t('common.close')}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <RadixDialog.Content className="fixed inset-0 z-50 outline-none md:left-1/2 md:top-1/2 md:inset-auto md:w-[calc(100%-2rem)] md:max-w-5xl md:-translate-x-1/2 md:-translate-y-1/2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          <PanelFrame header={header}>
            <PreferencesTabs />
          </PanelFrame>
        </RadixDialog.Content>
      </DialogPortal>
    </Dialog>
  );
}
