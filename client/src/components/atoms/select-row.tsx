import { type KeyboardEvent, type MouseEvent, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  description?: string;
  value: string;
  options: Option[];
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function SelectRow({ label, description, value, options, onChange, disabled }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);

  const openPicker = () => {
    const el = selectRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    } else {
      el.focus();
    }
  };

  const handleClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (disabled) {
      return;
    }
    if (e.target instanceof HTMLSelectElement) {
      return;
    }
    openPicker();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLLabelElement>) => {
    if (disabled) {
      return;
    }
    if (e.target instanceof HTMLSelectElement) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <label onClick={handleClick} onKeyDown={handleKeyDown} className={cn('flex items-center gap-4 rounded-md px-3 py-2.5 text-left transition', !disabled && 'cursor-pointer hover:bg-muted/40', disabled && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
      </div>
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="max-w-[180px] cursor-pointer truncate rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
