import { Camera, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarBackground } from '@/lib/themes';
import type { UserRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  user: Pick<UserRecord, 'email' | 'theme' | 'name'> & { avatarUrl?: string | null };
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}

export function AvatarEditor({ user, pendingFile, onPick, className, textClassName, iconClassName }: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return;
    }

    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const label = user.name || user.email || '?';
  const initials = label.slice(0, 2).toUpperCase();
  const source = pendingPreview ?? user.avatarUrl ?? null;

  return (
    <div className={cn('group relative inline-block', className)}>
      <Avatar className={cn('h-full w-full shadow-lg', className)} style={{ background: getAvatarBackground(user.theme) }}>
        {source ? <AvatarImage src={source} alt={label} className="object-cover" /> : null}
        <AvatarFallback className={cn('bg-transparent font-semibold text-white', textClassName)}>{initials}</AvatarFallback>
      </Avatar>

      <input ref={fileInput} id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label={t('auth.avatar.change')}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition group-hover:bg-black/45 group-hover:text-white focus-visible:bg-black/45 focus-visible:text-white focus-visible:outline-none"
      >
        <Camera className={cn('h-6 w-6', iconClassName)} />
      </button>

      {pendingFile ? (
        <button type="button" onClick={() => onPick(null)} aria-label={t('auth.avatar.cancelSelection')} className="absolute -right-1 -top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border transition hover:bg-muted">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
