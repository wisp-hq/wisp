import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';

interface Props {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (next: number) => void;
}

export function SliderRow({ label, description, value, min, max, step, unit, onChange }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="flex flex-col gap-2 rounded-md px-3 py-2.5 transition hover:bg-muted/40">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {draft}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <Slider value={[draft]} min={min} max={max} step={step} onValueChange={(v) => setDraft(v[0])} onValueCommit={(v) => onChange(v[0])} />
    </div>
  );
}
