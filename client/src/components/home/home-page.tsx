import { useLiveQuery } from '@tanstack/react-db';
import { AppWindow, Gamepad2, Library, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appShortcutsCollection, appsCollection, sessionsCollection } from '@/collections';
import { AppWizard, type AppWizardTarget } from '@/components/home/app-wizard';
import { AppsGrid } from '@/components/home/apps-grid';
import { CatalogSourcesDialog } from '@/components/home/catalog-sources-dialog';
import { ALL_CATEGORIES, CategoryFilter } from '@/components/home/category-filter';
import { HeaderTools } from '@/components/home/header-tools';
import { LaunchErrorBanner } from '@/components/home/launch-error-banner';
import { LibraryTab } from '@/components/home/library-tab';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCatalog } from '@/hooks/use-catalog';
import { useFocusOnGamepad } from '@/hooks/use-focus-on-gamepad';
import { useLaunchSession } from '@/hooks/use-launch-session';
import { useResolvedApps } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import { useHudPrefs } from '@/lib/hud-prefs';
import { createApp, updateApp } from '@/mutations/apps';
import { useUser } from '@/providers/auth-provider';
import { TopBar } from './top-bar';

const SKELETON_KEYS = ['s1', 's2', 's3', 's4'];

const tabTriggerClass = 'flex-initial rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2 pt-1 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [wizardTarget, setWizardTarget] = useState<AppWizardTarget>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const { data: apps = [], isLoading: appsLoading } = useLiveQuery((q) => q.from({ a: appsCollection }));
  const { data: sessions = [] } = useLiveQuery((q) => q.from({ s: sessionsCollection }));
  const { data: shortcuts = [] } = useLiveQuery((q) => q.from({ s: appShortcutsCollection }));
  const { data: catalog = [] } = useCatalog();

  const resolvedApps = useResolvedApps(apps);
  const installedSlugs = useMemo(() => new Set(apps.map((a) => a.slug)), [apps]);

  // Category options aggregate every app currently visible in the tab
  // (installed + admin-only catalog) so users only see filters that would
  // actually return results. Apps without a category are silently dropped
  // from the option list — they remain visible under the "all" pill.
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of resolvedApps) {
      if (r.spec?.category) {
        set.add(r.spec.category);
      }
    }

    if (isAdmin) {
      for (const entry of catalog) {
        if (entry.spec.category && !installedSlugs.has(entry.slug)) {
          set.add(entry.spec.category);
        }
      }
    }

    return Array.from(set).sort();
  }, [resolvedApps, catalog, isAdmin, installedSlugs]);

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered: Array<{ record: typeof resolvedApps[number]['record']; name: string }> = [];
    for (const r of resolvedApps) {
      const spec = r.spec;
      if (!spec) {
        continue;
      }

      if (category !== ALL_CATEGORIES && spec.category !== category) {
        continue;
      }

      const name = tr(spec, spec.name, locale);
      if (q && !name.toLowerCase().includes(q) && !tr(spec, spec.description, locale).toLowerCase().includes(q)) {
        continue;
      }

      filtered.push({ record: r.record, name });
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name, locale));
    return filtered.map((entry) => entry.record);
  }, [resolvedApps, search, locale, category]);
  const available = useMemo(() => {
    if (!isAdmin) {
      return [];
    }

    const q = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      if (installedSlugs.has(entry.slug)) {
        return false;
      }

      if (category !== ALL_CATEGORIES && entry.spec.category !== category) {
        return false;
      }

      return !q || tr(entry.spec, entry.spec.name, locale).toLowerCase().includes(q) || tr(entry.spec, entry.spec.description, locale).toLowerCase().includes(q);
    });
  }, [catalog, installedSlugs, isAdmin, search, locale, category]);

  const [hudPrefs] = useHudPrefs();

  const activeByApp = useMemo(() => {
    return sessions
      .filter(({ status }) => status === 'starting' || status === 'ready' || status === 'stopping')
      .reduce((acc, session) => {
        acc.set(session.app, session);
        return acc;
      }, new Map<string, (typeof sessions)[number]>());
  }, [sessions]);

  const idleProne = useMemo(() => !hudPrefs.keepAlive && sessions.some((s) => s.status === 'ready'), [hudPrefs.keepAlive, sessions]);
  const [idleNoticeDismissed, setIdleNoticeDismissed] = useState(false);

  const { launch, launchShortcut, cancelLaunch, pendingAppId, pendingShortcutId, error: launchError, dismissError } = useLaunchSession();

  const firstFocusKey = visibleApps[0] ? `app-${visibleApps[0].id}` : available[0] ? `catalog-${available[0].slug}` : null;
  useFocusOnGamepad(firstFocusKey);

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8">
      <TopBar />

      {launchError ? <LaunchErrorBanner error={launchError} onDismiss={dismissError} /> : null}

      {idleProne && !idleNoticeDismissed ? (
        <div className="mx-auto mt-4 flex max-w-5xl items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          <Timer className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{t('home.idleNotice')}</span>
          <button type="button" onClick={() => setIdleNoticeDismissed(true)} className="shrink-0 text-xs underline">
            {t('common.dismiss')}
          </button>
        </div>
      ) : null}

      <main className="mx-auto mt-10 max-w-5xl">
        <Tabs defaultValue="apps">
          <div className="mb-6 flex flex-wrap items-center gap-3 border-b">
            <TabsList className="h-auto w-auto justify-start gap-1 rounded-none bg-transparent p-0">
              <TabsTrigger value="apps" className={tabTriggerClass}>
                <AppWindow className="h-4 w-4" /> {t('home.tabs.apps')}
              </TabsTrigger>
              <TabsTrigger value="library" className={tabTriggerClass}>
                <Gamepad2 className="h-4 w-4" /> {t('home.tabs.library')}
              </TabsTrigger>
            </TabsList>
            <HeaderTools className="ml-auto pb-2" search={search} setSearch={setSearch}>
              {isAdmin ? (
                <CatalogSourcesDialog>
                  <Button variant="outline" size="icon" aria-label={t('catalogSources.openButton')}>
                    <Library className="h-4 w-4" />
                  </Button>
                </CatalogSourcesDialog>
              ) : null}
            </HeaderTools>
          </div>

          <TabsContent value="apps">
            {appsLoading ? (
              <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {SKELETON_KEYS.map((k) => (
                  <div key={k} className="aspect-square w-full animate-pulse rounded-xl border bg-card/40" />
                ))}
              </div>
            ) : (
              <>
                <CategoryFilter categories={availableCategories} selected={category} onSelect={setCategory} className="mb-4" />
                <AppsGrid visibleApps={visibleApps} available={available} activeByApp={activeByApp} pendingAppId={pendingAppId} isAdmin={isAdmin} launch={launch} cancelLaunch={cancelLaunch} setWizardTarget={setWizardTarget} />
              </>
            )}
          </TabsContent>

          <TabsContent value="library">
            <LibraryTab shortcuts={shortcuts} apps={apps} search={search} pendingShortcutId={pendingShortcutId} onLaunch={launchShortcut} />
          </TabsContent>
        </Tabs>
      </main>

      <AppWizard
        target={wizardTarget}
        onClose={() => setWizardTarget(null)}
        onSubmit={async (values) => {
          if (wizardTarget?.kind === 'edit') {
            await updateApp(wizardTarget.app.id, { spec: values.spec });
          } else {
            if (apps.some((a) => a.slug === values.slug)) {
              throw new Error(t('customInstall.errors.slugConflict', { slug: values.slug }));
            }

            await createApp({ slug: values.slug, catalogSource: values.catalogSource, version: values.version, spec: values.spec });
          }

          setWizardTarget(null);
        }}
      />
    </div>
  );
}
