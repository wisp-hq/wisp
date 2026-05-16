import { cn } from '@/lib/utils';

interface ToggleOption {
  value: string;
  label: string;
}

interface Props {
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export function VolumeModeToggle({ options, value, onChange }: Props) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-input/60 text-xs">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn('px-2 py-1 transition', value === option.value ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
