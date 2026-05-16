import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { avatarUrl } from '@/lib/pb';
import type { UserRecord } from '@/lib/types';

interface Props {
  user: UserRecord | null;
  onSubmit: (password: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function PasswordPrompt({ user, onSubmit, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = user?.name || user?.email || t('common.user');
  const avatar = user ? avatarUrl(user) : null;

  useEffect(() => {
    if (user) {
      setPassword('');
      setError(null);
      setPending(false);
      const hasTouchInput = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
      if (hasTouchInput) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }, [user]);

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            try {
              await onSubmit(password);
            } catch (err) {
              setError(err instanceof Error ? err.message : t('auth.password.loginFailed'));
              setPending(false);
            }
          }}
          className="flex flex-col gap-5"
        >
          <DialogHeader className="items-center text-center">
            <Avatar className="h-20 w-20" style={{ background: user?.theme || '#88aaff' }}>
              {avatar ? <AvatarImage src={avatar} alt={label} /> : null}
              <AvatarFallback className="bg-transparent text-2xl font-semibold text-white">{label.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{t('auth.password.enterToContinue')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">{t('auth.password.title')}</Label>
            <PasswordInput ref={inputRef} id="pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} placeholder="••••••••" />
          </div>

          {error ? <div className="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !password}>
              {pending ? t('auth.password.signingIn') : t('auth.password.signIn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
