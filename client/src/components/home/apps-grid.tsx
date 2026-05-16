import type { CatalogEntry } from '@/clients/catalog.client';
import { stopSession } from '@/clients/sessions.client';
import type { AppWizardTarget } from '@/components/home/app-wizard';
import { AvailableAppCard } from '@/components/home/available-app-card';
import { CustomInstallTile } from '@/components/home/custom-install-tile';
import { InstalledAppCard } from '@/components/home/installed-app-card';
import type { AppRecord, SessionRecord } from '@/lib/types';

interface Props {
  visibleApps: AppRecord[];
  available: CatalogEntry[];
  activeByApp: Map<string, SessionRecord>;
  pendingAppId: string | null;
  isAdmin: boolean;
  launch: (appId: string) => void;
  cancelLaunch: () => void;
  setWizardTarget: (target: AppWizardTarget) => void;
}

export function AppsGrid({ visibleApps, available, activeByApp, pendingAppId, isAdmin, launch, cancelLaunch, setWizardTarget }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {visibleApps.map((app) => {
        const session = activeByApp.get(app.id);
        return (
          <InstalledAppCard
            key={app.id}
            app={app}
            session={session}
            isStartPending={pendingAppId === app.id}
            onStart={() => launch(app.id)}
            onCancelStart={() => {
              if (session?.status === 'starting') {
                cancelLaunch();
                void stopSession(session.id);
              }
            }}
            onEdit={isAdmin ? () => setWizardTarget({ kind: 'edit', app }) : undefined}
            canRemove={isAdmin}
            canUpdate={isAdmin}
            updateAvailable={app.state?.imageStatus === 'outdated' || app.state?.imageStatus === 'not_pulled'}
          />
        );
      })}

      {available.map((entry) => (
        <AvailableAppCard key={entry.slug} entry={entry} onInstall={() => setWizardTarget({ kind: 'catalog', entry })} />
      ))}

      {isAdmin ? <CustomInstallTile onOpen={() => setWizardTarget({ kind: 'custom' })} /> : null}
    </div>
  );
}
