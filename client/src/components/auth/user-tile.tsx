import type { UserRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { displayLabel, UserAvatar } from './user-avatar';

interface Props {
  user: UserRecord;
  onClick: () => void;
}

export function UserTile({ user, onClick }: Props) {
  const label = displayLabel(user);

  return (
    <button type="button" onClick={onClick} className={cn('group flex flex-col items-center gap-3 rounded-2xl p-6 transition', 'hover:scale-[1.04] focus-visible:scale-[1.04] focus-visible:outline-none')}>
      <UserAvatar user={user} className="h-32 w-32 text-3xl ring-4 ring-transparent transition group-hover:ring-foreground/30 group-focus-visible:ring-foreground/60" />
      <span className="text-xl font-medium text-foreground">{label}</span>
    </button>
  );
}
