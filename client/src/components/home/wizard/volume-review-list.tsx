import { rowToVolume, type VolumeRow } from './wizard-shared';

interface Props {
  label: string;
  rows: VolumeRow[];
  emptyLabel: string;
}

interface DisplayedMount {
  key: string;
  hostPath: string;
  containerPath: string;
  mode: 'ro' | 'rw';
}

function expandRow(row: VolumeRow): DisplayedMount[] {
  const volume = rowToVolume(row, 'shared');
  if (!volume) {
    return [];
  }

  if (!volume.mounts) {
    return [{ key: `${volume.hostPath}:${volume.containerPath}`, hostPath: volume.hostPath, containerPath: volume.containerPath, mode: volume.mode }];
  }

  return volume.mounts.map((m) => {
    const host = m.hostPath ?? `${volume.hostPath}/${m.name}`;
    const container = m.containerPath ?? `${volume.containerPath}/${m.name}`;
    return { key: `${host}:${container}`, hostPath: host, containerPath: container, mode: m.mode };
  });
}

export function VolumeReviewList({ label, rows, emptyLabel }: Props) {
  const mounts = rows.flatMap(expandRow);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {mounts.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {mounts.map((mount) => (
            <li key={mount.key} className="flex items-center gap-2 font-mono text-xs">
              <span className="truncate">{mount.hostPath}</span>
              <span className="text-muted-foreground/60">→</span>
              <span className="truncate text-muted-foreground">{mount.containerPath}</span>
              <span className="text-[10px] uppercase text-muted-foreground/70">{mount.mode}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground/70">{emptyLabel}</span>
      )}
    </div>
  );
}
