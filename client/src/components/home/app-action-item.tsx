import type { ReactNode } from 'react';
import { ActionSheetItem } from '@/components/ui/action-sheet';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useActionSurface } from './app-action-menu';

interface Props {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function AppActionItem({ icon, label, onSelect, destructive = false }: Props) {
  const { surface, closeMenu } = useActionSurface();

  if (surface === 'sheet') {
    return (
      <ActionSheetItem
        icon={icon}
        destructive={destructive}
        onSelect={() => {
          closeMenu();
          onSelect();
        }}
      >
        {label}
      </ActionSheetItem>
    );
  }

  return (
    <DropdownMenuItem onSelect={onSelect} className={cn(destructive && 'text-destructive focus:text-destructive')}>
      {icon} {label}
    </DropdownMenuItem>
  );
}
