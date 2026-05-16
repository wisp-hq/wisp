import { cn } from '@/lib/utils';

interface PanelFrameProps {
  header: React.ReactNode;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PanelFrame({ header, rightPanel, children, className }: PanelFrameProps) {
  return (
    <div className={cn('flex h-[100dvh] w-full flex-col overflow-hidden bg-background', 'md:h-[min(820px,90vh)] md:rounded-2xl md:border md:shadow-2xl', className)}>
      {header}
      <div className={cn('flex min-h-0 flex-1 flex-col border-t md:flex-row md:grid', rightPanel ? 'md:grid-cols-[1fr_220px]' : 'md:grid-cols-1')}>
        <div className="order-2 min-w-0 flex-1 overflow-y-auto px-3 py-3 md:order-1 md:flex md:flex-col md:overflow-hidden md:px-5 md:py-5">{children}</div>
        {rightPanel ? <div className="order-1 shrink-0 overflow-x-auto border-b bg-muted/10 px-3 py-2 md:order-2 md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-l md:py-5">{rightPanel}</div> : null}
      </div>
    </div>
  );
}
