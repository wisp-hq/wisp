import { FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSessionLogs } from '@/lib/use-session-logs';
import { AppActionItem } from './app-action-item';

interface MenuItemProps {
  onSelect: () => void;
}

export function SessionLogsMenuItem({ onSelect }: MenuItemProps) {
  const { t } = useTranslation();
  return <AppActionItem icon={<FileText />} label={t('home.logs.menuLabel')} onSelect={onSelect} />;
}

interface DialogProps {
  sessionId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionLogsDialog({ sessionId, appName, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation();
  const { lines, connected } = useSessionLogs(open ? sessionId : null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lines.length === 0) {
      return;
    }

    const el = scrollRef.current;
    if (!el) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('home.logs.title', { appName })}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{connected ? t('home.logs.connected') : t('home.logs.disconnected')}</span>
          </DialogTitle>
        </DialogHeader>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded bg-muted/40 p-3 font-mono text-xs">
          {lines.length === 0 ? (
            <div className="text-muted-foreground">{t('home.logs.waiting')}</div>
          ) : (
            lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines append-only, order stable
              <div key={i} className="whitespace-pre-wrap break-words">
                {line}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
