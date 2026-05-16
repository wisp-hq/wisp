import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersCollection } from '@/collections';
import { CreateUserDialog } from '@/components/auth/create-user-dialog';
import { PasswordPrompt } from '@/components/auth/password-prompt';
import { UserTile } from '@/components/auth/user-tile';
import { pb } from '@/lib/pb';
import type { UserRecord } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (pb.authStore.isValid && pb.authStore.record) {
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { user, loginWithPassword } = useAuth();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  const { data: users = [] } = useLiveQuery((q) => q.from({ users: usersCollection }));

  async function handleCreateUser({ email, password, name, theme, avatar }: { email: string; password: string; name: string; theme: string; avatar: File | null }) {
    const body = new FormData();
    body.set('email', email);
    body.set('name', name);
    body.set('theme', theme);
    body.set('emailVisibility', 'true');
    body.set('password', password);
    body.set('passwordConfirm', password);
    if (avatar) {
      body.set('avatar', avatar);
    }

    await pb.collection<UserRecord>('users').create(body);
    await loginWithPassword(email, password);
    navigate({ to: '/', replace: true });
  }

  useEffect(() => {
    if (user) {
      navigate({ to: '/', replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 p-8">
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight">{t('auth.login.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('auth.login.subtitle')}</p>
      </header>

      <main className="flex flex-wrap items-start justify-center gap-4">
        {users.map((u) => (
          <UserTile key={u.id} user={u} onClick={() => setSelectedUser(u)} />
        ))}
        <CreateUserDialog onSubmit={handleCreateUser}>
          <button type="button" className="group flex flex-col items-center gap-3 rounded-2xl p-6 transition hover:scale-[1.04] focus-visible:scale-[1.04] focus-visible:outline-none">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-white/20 text-white/40 transition group-hover:border-white/40 group-hover:text-white/60 group-focus-visible:border-white/60">
              <UserPlus className="h-12 w-12" />
            </div>
            <span className="text-xl font-medium text-muted-foreground">{t('auth.login.newProfile')}</span>
          </button>
        </CreateUserDialog>
      </main>

      <PasswordPrompt
        user={selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        onSubmit={async (password) => {
          if (!selectedUser) {
            return;
          }

          await loginWithPassword(selectedUser.email || selectedUser.name, password);
          navigate({ to: '/', replace: true });
        }}
      />
    </div>
  );
}
