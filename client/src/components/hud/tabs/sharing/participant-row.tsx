import { Eye, Gamepad2, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParticipantRole, SessionParticipantRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

const PRESENCE_FRESH_MS = 30_000;
const PRESENCE_STALE_MS = 90_000;

function presenceState(lastSeenAt: string): 'online' | 'idle' | 'offline' {
  if (!lastSeenAt) {
    return 'offline';
  }

  const timestamp = Date.parse(lastSeenAt.replace(' ', 'T'));
  if (Number.isNaN(timestamp)) {
    return 'offline';
  }

  const age = Date.now() - timestamp;
  if (age < PRESENCE_FRESH_MS) {
    return 'online';
  }

  if (age < PRESENCE_STALE_MS) {
    return 'idle';
  }

  return 'offline';
}

interface Props {
  participant: SessionParticipantRecord;
  revoking: boolean;
  changingRole: boolean;
  onRevoke: () => void;
  onChangeRole: (next: ParticipantRole) => void;
}

export function ParticipantRow({ participant, revoking, changingRole, onRevoke, onChangeRole }: Props) {
  const { t } = useTranslation();
  const presence = presenceState(participant.lastSeenAt);
  const isPlayer = participant.role === 'player';
  const name = participant.displayName || t('hud.overlay.sharing.guestName');
  const slotLabel = isPlayer && participant.slot ? `P${participant.slot}` : null;
  const nextRole: ParticipantRole = isPlayer ? 'viewer' : 'player';
  const toggleTitle = isPlayer ? t('hud.overlay.sharing.demoteToViewer') : t('hud.overlay.sharing.promoteToPlayer');
  const ToggleIcon = isPlayer ? Eye : Gamepad2;

  return (
    <li className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
      <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', presence === 'online' && 'bg-emerald-500', presence === 'idle' && 'bg-amber-500', presence === 'offline' && 'bg-muted-foreground/40')} aria-hidden="true" title={t(`hud.overlay.sharing.presence.${presence}`)} />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {slotLabel ? <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono tabular-nums text-primary">{slotLabel}</span> : null}
      <span className="flex items-center gap-1 text-muted-foreground">
        {isPlayer ? <Gamepad2 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {isPlayer ? t('hud.overlay.sharing.rolePlayer') : t('hud.overlay.sharing.roleViewer')}
      </span>
      <button type="button" onClick={() => onChangeRole(nextRole)} disabled={changingRole} className="rounded p-1 text-muted-foreground hover:bg-muted-foreground/10 disabled:opacity-50" aria-label={toggleTitle} title={toggleTitle}>
        {changingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ToggleIcon className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={onRevoke} disabled={revoking} className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label={t('hud.overlay.sharing.eject')} title={t('hud.overlay.sharing.eject')}>
        {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}
