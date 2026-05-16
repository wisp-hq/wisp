import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ label, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:bg-muted/40">
        <span>{label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="mt-1 flex flex-col gap-1">{children}</div> : null}
    </div>
  );
}
