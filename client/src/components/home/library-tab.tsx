import { CheckSquare, Eye, EyeOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LibraryGrid } from '@/components/home/library-grid';
import { Button } from '@/components/ui/button';
import { useResolvedApps } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import type { AppRecord, AppShortcutRecord, FeatureShortcuts } from '@/lib/types';
import { cn } from '@/lib/utils';
import { setShortcutsHidden } from '@/mutations/shortcuts';

interface Props {
  shortcuts: AppShortcutRecord[];
  apps: AppRecord[];
  search: string;
  pendingShortcutId: string | null;
  onLaunch: (shortcutId: string) => void;
}

export function LibraryTab({ shortcuts, apps, search, pendingShortcutId, onLaunch }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const appsById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const resolvedApps = useResolvedApps(apps);
  const resolvedById = useMemo(() => new Map(resolvedApps.map((r) => [r.record.id, r])), [resolvedApps]);

  const shortcutProviderById = useMemo(() => {
    const map = new Map<string, string>();
    for (const shortcut of shortcuts) {
      const resolved = resolvedById.get(shortcut.app);
      const feature = resolved?.spec?.features?.shortcuts as FeatureShortcuts | undefined;
      if (feature?.provider) {
        map.set(shortcut.id, feature.provider);
      }
    }
    return map;
  }, [shortcuts, resolvedById]);

  const sources = useMemo(() => {
    const map = new Map<string, string>();
    for (const shortcut of shortcuts) {
      const resolved = resolvedById.get(shortcut.app);
      if (resolved?.spec) {
        map.set(resolved.record.id, tr(resolved.spec, resolved.spec.name, locale));
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [shortcuts, resolvedById, locale]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const shortcut of shortcuts) {
      if (sourceFilter && shortcut.app !== sourceFilter) {
        continue;
      }

      if (!showHidden && shortcut.hidden) {
        continue;
      }

      if (shortcut.group) {
        set.add(shortcut.group);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, locale));
  }, [shortcuts, sourceFilter, showHidden, locale]);

  const hiddenCount = useMemo(() => shortcuts.filter((shortcut) => shortcut.hidden).length, [shortcuts]);

  const visibleShortcuts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shortcuts
      .filter((shortcut) => {
        if (!showHidden && shortcut.hidden) {
          return false;
        }

        if (sourceFilter && shortcut.app !== sourceFilter) {
          return false;
        }

        if (groupFilter && shortcut.group !== groupFilter) {
          return false;
        }

        if (!q) {
          return true;
        }

        return shortcut.name.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [shortcuts, search, sourceFilter, groupFilter, showHidden, locale]);

  const handleSourceChange = (next: string | null) => {
    setSourceFilter(next);
    setGroupFilter(null);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(visibleShortcuts.map((shortcut) => shortcut.id)));
  };

  const bulkSetHidden = async (hidden: boolean) => {
    const ids = Array.from(selectedIds);
    exitSelection();
    await setShortcutsHidden(ids, hidden);
  };

  const allVisibleSelected = visibleShortcuts.length > 0 && visibleShortcuts.every((shortcut) => selectedIds.has(shortcut.id));
  const selectionHasHidden = visibleShortcuts.some((shortcut) => selectedIds.has(shortcut.id) && shortcut.hidden);
  const selectionHasVisible = visibleShortcuts.some((shortcut) => selectedIds.has(shortcut.id) && !shortcut.hidden);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {sources.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => handleSourceChange(null)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', sourceFilter === null ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
              {t('home.library.allSources')}
            </button>
            {sources.map((source) => (
              <button key={source.id} type="button" onClick={() => handleSourceChange(source.id)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', sourceFilter === source.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                {source.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {hiddenCount > 0 ? (
            <button type="button" onClick={() => setShowHidden((current) => !current)} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition hover:text-foreground">
              {showHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showHidden ? t('home.library.hideHidden', { count: hiddenCount }) : t('home.library.showHidden', { count: hiddenCount })}
            </button>
          ) : null}
          {shortcuts.length > 0 && !selectionMode ? (
            <button type="button" onClick={() => setSelectionMode(true)} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition hover:text-foreground">
              <CheckSquare className="h-3 w-3" />
              {t('home.library.select')}
            </button>
          ) : null}
        </div>
      </div>

      {sourceFilter && groups.length >= 2 ? (
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setGroupFilter(null)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', groupFilter === null ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
            {t('home.library.allGroups')}
          </button>
          {groups.map((group) => (
            <button key={group} type="button" onClick={() => setGroupFilter(group)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', groupFilter === group ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
              {group}
            </button>
          ))}
        </div>
      ) : null}

      {selectionMode ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
          <span className="text-sm font-medium">{t('home.library.selectedCount', { count: selectedIds.size })}</span>
          <button type="button" onClick={selectAllVisible} disabled={allVisibleSelected} className="text-xs text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-40 disabled:hover:no-underline">
            {t('home.library.selectAll')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {selectionHasVisible ? (
              <Button size="sm" variant="outline" onClick={() => void bulkSetHidden(true)}>
                <EyeOff className="h-4 w-4" /> {t('home.library.hideSelected')}
              </Button>
            ) : null}
            {selectionHasHidden ? (
              <Button size="sm" variant="outline" onClick={() => void bulkSetHidden(false)}>
                <Eye className="h-4 w-4" /> {t('home.library.showSelected')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={exitSelection}>
              <X className="h-4 w-4" /> {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {visibleShortcuts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">{shortcuts.length === 0 ? t('home.library.empty') : t('home.library.noMatches')}</div>
      ) : (
        <LibraryGrid
          shortcuts={visibleShortcuts}
          appsById={appsById}
          shortcutProviderById={shortcutProviderById}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          pendingShortcutId={pendingShortcutId}
          onLaunch={onLaunch}
          onToggleSelect={toggleSelect}
        />
      )}
    </>
  );
}
