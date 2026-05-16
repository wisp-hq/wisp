import { isGroupedVolume, type Volume } from '@/lib/types';

export interface SubMountRow {
  name: string;
  mode: 'ro' | 'rw';
  hostPathOverride: string;
  containerPathOverride: string;
}

// VolumeRow drives a single row in the wizard. The discriminant `kind` keeps
// the shape rigid: simple rows carry a single (hostPath, containerPath, mode);
// grouped rows hold a list of sub-mounts and may render the "advanced" toggle
// to surface per-sub overrides.
export interface SimpleVolumeRow {
  id: string;
  kind: 'simple';
  hostPath: string;
  containerPath: string;
  mode: 'ro' | 'rw';
}

export interface GroupedVolumeRow {
  id: string;
  kind: 'grouped';
  hostPath: string;
  containerPath: string;
  mounts: SubMountRow[];
}

export type VolumeRow = SimpleVolumeRow | GroupedVolumeRow;

export const newVolumeRow = (mode: 'ro' | 'rw' = 'rw'): VolumeRow => ({
  id: crypto.randomUUID(),
  kind: 'simple',
  hostPath: '',
  containerPath: '',
  mode,
});

export function isRowIncomplete(row: VolumeRow): boolean {
  const hostMissing = !row.hostPath.trim();
  const containerMissing = !row.containerPath.trim();
  if (row.kind === 'simple') {
    return hostMissing !== containerMissing;
  }

  // Grouped: the roots must both be present or both blank — the sub-mounts
  // append leaves to them. Per-sub overrides aren't validated as "incomplete"
  // since blank means "fall back to the root + name composition".
  return hostMissing !== containerMissing;
}

export function rowHasSubOverrides(row: GroupedVolumeRow): boolean {
  return row.mounts.some((m) => m.hostPathOverride.trim() !== '' || m.containerPathOverride.trim() !== '');
}

export function volumeToRow(v: Volume): VolumeRow {
  if (isGroupedVolume(v)) {
    return {
      id: v.id,
      kind: 'grouped',
      hostPath: v.hostPath,
      containerPath: v.containerPath,
      mounts: v.mounts.map((m) => ({
        name: m.name,
        mode: m.mode,
        hostPathOverride: m.hostPath ?? '',
        containerPathOverride: m.containerPath ?? '',
      })),
    };
  }

  return {
    id: v.id,
    kind: 'simple',
    hostPath: v.hostPath,
    containerPath: v.containerPath,
    mode: v.mode,
  };
}

export function rowToVolume(row: VolumeRow, scope: 'shared' | 'perUser'): Volume | null {
  const hostPath = row.hostPath.trim();
  const containerPath = row.containerPath.trim();
  if (!hostPath || !containerPath) {
    return null;
  }

  if (row.kind === 'grouped') {
    return {
      id: row.id,
      scope,
      hostPath,
      containerPath,
      mounts: row.mounts.map((m) => {
        const hostOverride = m.hostPathOverride.trim();
        const containerOverride = m.containerPathOverride.trim();
        return {
          name: m.name,
          mode: m.mode,
          ...(hostOverride ? { hostPath: hostOverride } : {}),
          ...(containerOverride ? { containerPath: containerOverride } : {}),
        };
      }),
    };
  }

  return { id: row.id, scope, hostPath, containerPath, mode: row.mode };
}

export function volumesToRows(volumes: Volume[] | undefined, scope: 'shared' | 'perUser'): VolumeRow[] {
  return (volumes ?? []).filter((v) => v.scope === scope).map(volumeToRow);
}

export function rowsToVolumes(rows: VolumeRow[], scope: 'shared' | 'perUser'): Volume[] {
  const out: Volume[] = [];
  for (const row of rows) {
    const v = rowToVolume(row, scope);
    if (v) {
      out.push(v);
    }
  }

  return out;
}

export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid env line (expected KEY=VALUE): ${trimmed}`);
    }

    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }

  return env;
}
