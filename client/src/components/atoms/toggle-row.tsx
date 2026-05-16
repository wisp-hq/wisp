import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ label, description, checked, onChange, disabled = false }: Props) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-center gap-4 rounded-md px-3 py-2.5 transition', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/40')}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
