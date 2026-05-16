import { FolderOpen, Gamepad2, MonitorCog, Sliders, Users, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SelkiesBridge } from '@/lib/selkies-bridge';
import { useIsViewer } from '@/lib/use-participant-role';
import { AudioTab } from './tabs/audio-tab';
import { FilesTab } from './tabs/files-tab';
import { GamepadTab } from './tabs/gamepad-tab';
import { GeneralTab } from './tabs/general-tab';
import { SharingTab } from './tabs/sharing-tab';
import { VideoTab } from './tabs/video-tab';

interface PreferencesTabsProps {
  sessionId?: string;
  isOwner?: boolean;
  bridge?: SelkiesBridge;
}

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
  component: React.ReactNode;
}

export function PreferencesTabs({ sessionId, isOwner = false, bridge }: PreferencesTabsProps) {
  const { t } = useTranslation();
  const isViewer = useIsViewer();
  const tabs: TabDef[] = [
    { value: 'general', icon: <Sliders className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.general'), component: <GeneralTab isOwner={!sessionId || isOwner} /> },
    { value: 'video', icon: <MonitorCog className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.display'), component: <VideoTab bridge={bridge} /> },
    { value: 'audio', icon: <Volume2 className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.audio'), component: <AudioTab /> },
  ];

  if (!isViewer) {
    tabs.push({ value: 'gamepad', icon: <Gamepad2 className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.gamepad'), component: <GamepadTab /> });
  }

  if (sessionId && !isViewer) {
    tabs.push({ value: 'files', icon: <FolderOpen className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.files'), component: <FilesTab sessionId={sessionId} bridge={bridge} /> });
  }

  if (sessionId && isOwner) {
    tabs.push({ value: 'sharing', icon: <Users className="h-3.5 w-3.5" />, label: t('hud.overlay.tab.sharing'), component: <SharingTab sessionId={sessionId} /> });
  }

  return (
    <Tabs defaultValue="general" className="flex flex-col gap-3 md:h-full md:min-h-0 md:flex-row md:gap-6">
      <TabsList className="h-auto w-full shrink-0 justify-stretch gap-1 bg-transparent p-1 md:w-44 md:flex-col md:items-stretch">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            aria-label={tab.label}
            title={tab.label}
            className="h-10 flex-1 basis-0 cursor-pointer justify-center gap-2 rounded-md px-2 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-3 md:flex-none md:basis-auto md:justify-start md:gap-2.5"
          >
            {tab.icon}
            <span className="hidden min-w-0 truncate sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="min-w-0 flex-1 md:h-full md:min-h-0 md:overflow-y-auto">
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            <div className="mb-3 hidden px-3 text-base font-semibold md:block">{tab.label}</div>
            {tab.component}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
