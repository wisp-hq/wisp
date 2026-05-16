import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Download, Pencil, Play, Square } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppUpdate } from '@/hooks/use-app-update';
import { useResolvedApp } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import type { AppRecord, SessionRecord, SessionStatus } from '@/lib/types';
import { usePullProgress } from '@/lib/use-pull-progress';
import { AppActionItem } from './app-action-item';
import { AppActionMenu } from './app-action-menu';
import { AppTile } from './app-tile';
import { RemoveAppDialog, RemoveAppMenuItem } from './remove-app-action';
import { SessionLogsDialog, SessionLogsMenuItem } from './session-logs-action';
import { StopSessionDialog, StopSessionMenuItem } from './stop-session-action';
import { TakeoverDialog, TakeoverMenuItem } from './takeover-action';

interface Props {
  app: AppRecord;
  session?: SessionRecord;
  isStartPending?: boolean;
  onStart: () => void;
  onCancelStart: () => void;
  onEdit?: () => void;
  canRemove?: boolean;
  canUpdate?: boolean;
  updateAvailable?: boolean;
}

export function InstalledAppCard({ app, session, isStartPending = false, onStart, onCancelStart, onEdit, canRemove = false, canUpdate = false, updateAvailable = false }: Props) {
  const { t, i18n } = useTranslation();
  const resolved = useResolvedApp(app);
  const name = resolved.spec ? tr(resolved.spec, resolved.spec.name, i18n.language) : app.slug;
  const pullProgress = usePullProgress(session?.status === 'starting' ? session.id : null);
  // While the launch mutation is in flight the session record doesn't exist yet,
  // so synthesise a `starting` status to give the user immediate feedback rather
  // than letting the tile sit idle until PB's realtime push arrives.
  const status: SessionStatus | undefined = session?.status ?? (isStartPending ? 'starting' : undefined);

  const { trigger: triggerUpdate, isUpdating, progress: updateProgress } = useAppUpdate(app);

  const disabled = status === 'stopping' || isUpdating;
  const { ref: focusRef, focused } = useFocusable<HTMLButtonElement>({ focusKey: `app-${app.id}` });

  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const tile = <AppTile ref={focusRef} data-focused={focused || undefined} app={app} installed sessionStatus={status} pullProgress={pullProgress} updateProgress={isUpdating ? updateProgress : undefined} updateAvailable={updateAvailable && !status && !isUpdating} />;

  return (
    <>
      <AppActionMenu title={name} disabled={disabled} tile={tile}>
        {session?.status === 'ready' ? (
          <>
            <TakeoverMenuItem sessionId={session.id} updated={session.updated} onRequestTakeover={() => setTakeoverOpen(true)} />
            <SessionLogsMenuItem onSelect={() => setLogsOpen(true)} />
            <StopSessionMenuItem onSelect={() => setStopOpen(true)} />
          </>
        ) : session?.status === 'starting' ? (
          <AppActionItem icon={<Square />} label={t('home.cancel')} destructive onSelect={onCancelStart} />
        ) : (
          <>
            <AppActionItem icon={<Play />} label={t('home.start')} onSelect={onStart} />
            {canUpdate && updateAvailable ? <AppActionItem icon={<Download />} label={t('home.update')} onSelect={triggerUpdate} /> : null}
            {onEdit ? <AppActionItem icon={<Pencil />} label={t('customInstall.edit')} onSelect={onEdit} /> : null}
            {canRemove ? <RemoveAppMenuItem onSelect={() => setRemoveOpen(true)} /> : null}
          </>
        )}
      </AppActionMenu>
      {session ? (
        <>
          <TakeoverDialog sessionId={session.id} appName={name} open={takeoverOpen} onOpenChange={setTakeoverOpen} />
          <SessionLogsDialog sessionId={session.id} appName={name} open={logsOpen} onOpenChange={setLogsOpen} />
          <StopSessionDialog sessionId={session.id} appName={name} open={stopOpen} onOpenChange={setStopOpen} />
        </>
      ) : null}
      {canRemove ? <RemoveAppDialog appId={app.id} appName={name} open={removeOpen} onOpenChange={setRemoveOpen} /> : null}
    </>
  );
}
