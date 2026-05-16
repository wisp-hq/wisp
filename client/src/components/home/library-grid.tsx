import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutCard } from '@/components/home/shortcut-card';
import { useLibraryColumns } from '@/hooks/use-library-columns';
import { useResolvedApps } from '@/hooks/use-resolved-app';
import { tr } from '@/lib/app-spec';
import type { AppRecord, AppShortcutRecord } from '@/lib/types';
import { setShortcutHidden } from '@/mutations/shortcuts';

interface Props {
  shortcuts: AppShortcutRecord[];
  appsById: Map<string, AppRecord>;
  shortcutProviderById: Map<string, string>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  pendingShortcutId: string | null;
  onLaunch: (shortcutId: string) => void;
  onToggleSelect: (shortcutId: string) => void;
}

export function LibraryGrid({ shortcuts, appsById, shortcutProviderById, selectionMode, selectedIds, pendingShortcutId, onLaunch, onToggleSelect }: Props) {
  const apps = useMemo(() => Array.from(appsById.values()), [appsById]);
  const resolvedApps = useResolvedApps(apps);
  const resolvedById = useMemo(() => new Map(resolvedApps.map((r) => [r.record.id, r])), [resolvedApps]);
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const update = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const { count: cols, gap } = useLibraryColumns();
  const tileWidth = containerWidth > 0 ? (containerWidth - (cols - 1) * gap) / cols : 0;
  // Tile is aspect-[2/3] portrait, so height = width * 1.5.
  const rowHeight = tileWidth > 0 ? tileWidth * 1.5 + gap : 240;
  const rowCount = Math.ceil(shortcuts.length / cols);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 4,
    scrollMargin,
  });

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const start = virtualRow.index * cols;
        const rowShortcuts = shortcuts.slice(start, start + cols);
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            className="absolute left-0 right-0 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6"
            style={{ top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            {rowShortcuts.map((shortcut) => {
              const resolved = resolvedById.get(shortcut.app);
              const provider = shortcutProviderById.get(shortcut.id) ?? '';
              const appName = resolved?.spec ? tr(resolved.spec, resolved.spec.name, locale) : provider;
              return (
                <ShortcutCard
                  key={shortcut.id}
                  shortcut={shortcut}
                  appName={appName}
                  source={provider}
                  isStartPending={pendingShortcutId === shortcut.id}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(shortcut.id)}
                  onLaunch={() => onLaunch(shortcut.id)}
                  onToggleHidden={() => void setShortcutHidden(shortcut.id, !shortcut.hidden)}
                  onToggleSelect={() => onToggleSelect(shortcut.id)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
