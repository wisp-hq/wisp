import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/pb';
import { getAvatarBackground } from '@/lib/themes';
import type { UserRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  user: UserRecord;
  className?: string;
}

export function UserAvatar({ user, className }: Props) {
  const label = displayLabel(user);
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatar = avatarUrl(user);

  return (
    <Avatar className={cn('shadow-lg', className)} style={{ background: getAvatarBackground(user.theme) }}>
      {avatar ? <AvatarImage src={avatar} alt={label} /> : null}
      <AvatarFallback className={cn('bg-transparent font-semibold text-white', className)}>{initials}</AvatarFallback>
    </Avatar>
  );
}

export function displayLabel(user: UserRecord): string {
  return user.name || user.email || 'User';
}
