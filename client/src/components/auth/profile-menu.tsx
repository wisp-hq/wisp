import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Link } from '@tanstack/react-router';
import { ChevronDown, KeyRound, LogOut, MonitorCog, UserPen } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { displayLabel, UserAvatar } from '@/components/auth/user-avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser } from '@/providers/auth-provider';
import { ChangePasswordDialog } from './change-password-dialog';
import { EditProfileDialog } from './edit-profile-dialog';
import { HudPreferencesDialog } from './hud-preferences-dialog';

function swallowArrowKeys(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
  }
}

export function ProfileMenu() {
  const { t } = useTranslation();
  const user = useUser();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [hudPrefsOpen, setHudPrefsOpen] = useState(false);
  const label = displayLabel(user);
  const { ref, focused } = useFocusable<HTMLButtonElement>({ focusKey: 'topbar-profile' });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onKeyDown={swallowArrowKeys}>
          <button
            ref={ref}
            type="button"
            aria-label={t('auth.profile.openMenu', { name: label })}
            data-focused={focused || undefined}
            className="group flex items-center gap-2 rounded-full border border-transparent bg-muted/40 p-1 outline-none transition hover:bg-muted focus:ring-2 focus:ring-inset focus:ring-ring data-[focused]:ring-2 data-[focused]:ring-inset data-[focused]:ring-ring data-[state=open]:bg-muted data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-ring sm:pr-3"
          >
            <UserAvatar user={user} className="h-9 w-9 text-sm" />
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{label}</span>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground transition group-data-[state=open]:rotate-180 sm:block" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span>{label}</span>
            {user.email ? <span className="text-xs font-normal text-muted-foreground">{user.email}</span> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <UserPen /> {t('auth.profile.editProfile')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound /> {t('auth.profile.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHudPrefsOpen(true)}>
            <MonitorCog /> {t('auth.profile.hudPreferences')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/logout">
              <LogOut /> {t('auth.profile.signOut')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <HudPreferencesDialog open={hudPrefsOpen} onOpenChange={setHudPrefsOpen} />
    </>
  );
}
