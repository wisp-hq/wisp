import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function ActionSheet({ open, onOpenChange, title, children }: ActionSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1 rounded-t-2xl border-t bg-background p-3 outline-none pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
          <DialogPrimitive.Title className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ActionSheetItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

export function ActionSheetItem({ icon, children, onSelect, destructive = false }: ActionSheetItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-base transition active:bg-accent',
        destructive && 'text-destructive active:bg-destructive/15',
      )}
    >
      {icon ? <span className="flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
