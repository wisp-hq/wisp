import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}

export function ReviewRow({ label, value, mono, muted }: Props) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right text-sm', mono && 'font-mono text-xs', muted && 'text-muted-foreground/70')}>{value}</span>
    </div>
  );
}
