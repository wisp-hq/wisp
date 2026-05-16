import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Eye, EyeOff, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionSheet, ActionSheetItem } from '@/components/ui/action-sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTapDropdown } from '@/hooks/use-tap-dropdown';
import type { AppShortcutRecord } from '@/lib/types';
import { useIsMobile } from '@/lib/use-media-query';
import { swallowArrowKeys } from './app-tile';
import { ShortcutTile } from './shortcut-tile';

interface Props {
  shortcut: AppShortcutRecord;
  appName: string;
  source: string;
  isStartPending?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onLaunch: () => void;
  onToggleHidden: () => void;
  onToggleSelect?: () => void;
}

export function ShortcutCard({ shortcut, appName, source, isStartPending = false, selectionMode = false, selected = false, onLaunch, onToggleHidden, onToggleSelect }: Props) {
  const { t } = useTranslation();
  const { open, setOpen, triggerProps } = useTapDropdown(isStartPending || selectionMode);
  const { ref: focusRef, focused } = useFocusable<HTMLButtonElement>({ focusKey: `shortcut-${shortcut.id}` });
  const isMobile = useIsMobile();

  const hideAction = (
    <>
      {shortcut.hidden ? <Eye /> : <EyeOff />} {shortcut.hidden ? t('home.library.show') : t('home.library.hide')}
    </>
  );

  if (selectionMode) {
    return (
      <ShortcutTile
        ref={focusRef}
        data-focused={focused || undefined}
        shortcut={shortcut}
        appName={appName}
        source={source}
        isStartPending={false}
        selected={selected}
        selectionMode
        onClick={onToggleSelect}
      />
    );
  }

  const tile = (
    <ShortcutTile
      ref={focusRef}
      data-focused={focused || undefined}
      shortcut={shortcut}
      appName={appName}
      source={source}
      isStartPending={isStartPending}
      {...triggerProps}
      onClick={isMobile && !isStartPending ? () => setOpen(true) : undefined}
    />
  );

  if (isMobile) {
    return (
      <>
        {tile}
        <ActionSheet open={open} onOpenChange={setOpen} title={shortcut.name}>
          <ActionSheetItem
            icon={<Play />}
            onSelect={() => {
              setOpen(false);
              onLaunch();
            }}
          >
            {t('home.library.play')}
          </ActionSheetItem>
          <ActionSheetItem
            icon={shortcut.hidden ? <Eye /> : <EyeOff />}
            onSelect={() => {
              setOpen(false);
              onToggleHidden();
            }}
          >
            {shortcut.hidden ? t('home.library.show') : t('home.library.hide')}
          </ActionSheetItem>
        </ActionSheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={isStartPending} onKeyDown={swallowArrowKeys}>
        {tile}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{shortcut.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLaunch}>
          <Play /> {t('home.library.play')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleHidden}>{hideAction}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
