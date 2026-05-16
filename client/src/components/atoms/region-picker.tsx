import { useTranslation } from 'react-i18next';
import type { Region } from '@/lib/types';
import { cn } from '@/lib/utils';

const REGIONS: Region[] = ['eu', 'us', 'jp', 'wor'];

interface Props {
  value: Region | '';
  onChange: (next: Region) => void;
}

export function RegionPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {REGIONS.map((region) => {
        const selected = value === region;
        return (
          <button
            key={region}
            type="button"
            onClick={() => onChange(region)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition',
              selected ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`auth.edit.regions.${region}`)}
          </button>
        );
      })}
    </div>
  );
}
