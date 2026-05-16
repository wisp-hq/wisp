import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { VolumeModeToggle } from './volume-mode-toggle';
import { type GroupedVolumeRow, isRowIncomplete, rowHasSubOverrides, type SimpleVolumeRow, type SubMountRow, type VolumeRow } from './wizard-shared';

interface Props {
  title: string;
  hint: string;
  hostPlaceholder: string;
  rows: VolumeRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPatch: (index: number, patch: Partial<VolumeRow>) => void;
  addLabel: string;
  removeLabel: string;
  emptyLabel: string;
  rowIncompleteLabel: string;
}

const MODE_OPTIONS: Array<{ value: 'ro' | 'rw'; label: string }> = [
  { value: 'rw', label: 'rw' },
  { value: 'ro', label: 'ro' },
];

export function VolumeSection({ title, hint, hostPlaceholder, rows, onAdd, onRemove, onPatch, addLabel, removeLabel, emptyLabel, rowIncompleteLabel }: Props) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-input/60 p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Label>{title}</Label>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-input/60 px-3 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.id} className="flex flex-col gap-1">
              {row.kind === 'simple' ? (
                <SimpleRow row={row} index={index} hostPlaceholder={hostPlaceholder} onPatch={onPatch} onRemove={onRemove} removeLabel={removeLabel} rowIncompleteLabel={rowIncompleteLabel} />
              ) : (
                <GroupedRow row={row} index={index} hostPlaceholder={hostPlaceholder} onPatch={onPatch} onRemove={onRemove} removeLabel={removeLabel} rowIncompleteLabel={rowIncompleteLabel} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface SimpleRowProps {
  row: SimpleVolumeRow;
  index: number;
  hostPlaceholder: string;
  onPatch: (index: number, patch: Partial<VolumeRow>) => void;
  onRemove: (index: number) => void;
  removeLabel: string;
  rowIncompleteLabel: string;
}

function SimpleRow({ row, index, hostPlaceholder, onPatch, onRemove, removeLabel, rowIncompleteLabel }: SimpleRowProps) {
  const incomplete = isRowIncomplete(row);
  return (
    <>
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-2">
        <Input value={row.hostPath} onChange={(event) => onPatch(index, { hostPath: event.target.value })} placeholder={hostPlaceholder} aria-invalid={incomplete && !row.hostPath.trim() ? true : undefined} className="font-mono text-xs" />
        <Input value={row.containerPath} onChange={(event) => onPatch(index, { containerPath: event.target.value })} placeholder="/config" aria-invalid={incomplete && !row.containerPath.trim() ? true : undefined} className="font-mono text-xs" />
        <div className="flex items-center gap-2 sm:contents">
          <VolumeModeToggle options={MODE_OPTIONS} value={row.mode} onChange={(mode) => onPatch(index, { mode: mode as 'ro' | 'rw' })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label={removeLabel}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {incomplete ? <p className="text-xs text-destructive">{rowIncompleteLabel}</p> : null}
    </>
  );
}

interface GroupedRowProps {
  row: GroupedVolumeRow;
  index: number;
  hostPlaceholder: string;
  onPatch: (index: number, patch: Partial<VolumeRow>) => void;
  onRemove: (index: number) => void;
  removeLabel: string;
  rowIncompleteLabel: string;
}

function GroupedRow({ row, index, hostPlaceholder, onPatch, onRemove, removeLabel, rowIncompleteLabel }: GroupedRowProps) {
  const { t } = useTranslation();
  const incomplete = isRowIncomplete(row);
  const [advanced, setAdvanced] = useState(() => rowHasSubOverrides(row));

  function patchSub(subIndex: number, patch: Partial<SubMountRow>) {
    const nextMounts = row.mounts.map((m, i) => (i === subIndex ? { ...m, ...patch } : m));
    onPatch(index, { mounts: nextMounts } as Partial<VolumeRow>);
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-2">
        <Input value={row.hostPath} onChange={(event) => onPatch(index, { hostPath: event.target.value })} placeholder={hostPlaceholder} aria-invalid={incomplete && !row.hostPath.trim() ? true : undefined} className="font-mono text-xs" />
        <Input value={row.containerPath} onChange={(event) => onPatch(index, { containerPath: event.target.value })} placeholder="/config" aria-invalid={incomplete && !row.containerPath.trim() ? true : undefined} className="font-mono text-xs" />
        <div aria-hidden className="invisible hidden sm:block">
          <VolumeModeToggle options={MODE_OPTIONS} value="rw" onChange={() => {}} />
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label={removeLabel}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <button type="button" onClick={() => setAdvanced((v) => !v)} className="-mt-0.5 flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground">
        {advanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t('wizard.storage.groupedSubMounts', { count: row.mounts.length })}
      </button>

      {advanced ? (
        <ul className="flex flex-col gap-1 rounded-md border border-input/40 bg-muted/30 p-2">
          {row.mounts.map((sub, subIndex) => (
            <li key={sub.name} className="flex flex-col gap-1 sm:grid sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <span className="truncate font-mono text-xs">{sub.name}</span>
              <Input value={sub.hostPathOverride} onChange={(event) => patchSub(subIndex, { hostPathOverride: event.target.value })} placeholder={`${row.hostPath || '<host>'}/${sub.name}`} className={cn('font-mono text-xs', !sub.hostPathOverride && 'text-muted-foreground/80')} />
              <Input value={sub.containerPathOverride} onChange={(event) => patchSub(subIndex, { containerPathOverride: event.target.value })} placeholder={`${row.containerPath || '<container>'}/${sub.name}`} className={cn('font-mono text-xs', !sub.containerPathOverride && 'text-muted-foreground/80')} />
              <VolumeModeToggle options={MODE_OPTIONS} value={sub.mode} onChange={(mode) => patchSub(subIndex, { mode: mode as 'ro' | 'rw' })} />
            </li>
          ))}
        </ul>
      ) : null}

      {incomplete ? <p className="text-xs text-destructive">{rowIncompleteLabel}</p> : null}
    </>
  );
}
