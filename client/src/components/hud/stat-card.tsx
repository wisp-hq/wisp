import { Sparkline } from '@/components/atoms/sparkline';
import { cn } from '@/lib/utils';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string;
  values: number[];
  min?: number;
  max?: number;
  accent: string;
}

export function StatCard({ icon, label, value, values, min, max, accent }: Props) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 items-center gap-1 rounded-md border bg-muted/20 px-1.5 py-1 text-[11px] md:flex-none md:basis-auto md:flex-col md:items-stretch md:gap-1 md:px-2.5 md:py-2 md:text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 md:w-full md:flex-none">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="hidden min-w-0 truncate text-muted-foreground md:inline">{label}</span>
        <span className="ml-auto whitespace-nowrap font-medium tabular-nums">{value}</span>
      </div>
      <Sparkline values={values} min={min} max={max} height={24} className={cn('hidden h-6 w-full md:block', accent)} />
    </div>
  );
}
