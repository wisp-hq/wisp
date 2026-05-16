import { cloneElement, createContext, isValidElement, type ReactNode, useContext, useMemo } from 'react';
import { ActionSheet } from '@/components/ui/action-sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTapDropdown } from '@/hooks/use-tap-dropdown';
import { useIsMobile } from '@/lib/use-media-query';
import { swallowArrowKeys } from './app-tile';

type Surface = 'dropdown' | 'sheet';

interface SurfaceContextValue {
  surface: Surface;
  closeMenu: () => void;
}

const SurfaceContext = createContext<SurfaceContextValue | null>(null);

export function useActionSurface(): SurfaceContextValue {
  const ctx = useContext(SurfaceContext);
  if (!ctx) {
    throw new Error('useActionSurface must be used inside an <AppActionMenu>');
  }

  return ctx;
}

interface Props {
  title: string;
  disabled?: boolean;
  tile: ReactNode;
  children: ReactNode;
}

export function AppActionMenu({ title, disabled = false, tile, children }: Props) {
  const isMobile = useIsMobile();
  const { open, setOpen, triggerProps } = useTapDropdown(disabled);

  const sheetCtx = useMemo<SurfaceContextValue>(() => ({ surface: 'sheet', closeMenu: () => setOpen(false) }), [setOpen]);
  const dropdownCtx = useMemo<SurfaceContextValue>(() => ({ surface: 'dropdown', closeMenu: () => setOpen(false) }), [setOpen]);

  if (isMobile) {
    const tileWithTap = isValidElement(tile) ? cloneElement(tile, { onClick: disabled ? undefined : () => setOpen(true) } as object) : tile;
    return (
      <>
        {tileWithTap}
        <ActionSheet open={open} onOpenChange={setOpen} title={title}>
          <SurfaceContext.Provider value={sheetCtx}>{children}</SurfaceContext.Provider>
        </ActionSheet>
      </>
    );
  }

  const tileWithTrigger = isValidElement(tile) ? cloneElement(tile, triggerProps as object) : tile;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled} onKeyDown={swallowArrowKeys}>
        {tileWithTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SurfaceContext.Provider value={dropdownCtx}>{children}</SurfaceContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
