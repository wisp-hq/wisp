import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lookupInvite } from '@/clients/invites.client';
import { claimParticipant } from '@/clients/participants.client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/join/$token')({
  component: JoinPage,
});

function JoinPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const [name, setName] = useState('');

  const lookup = useQuery({
    queryKey: ['invite-lookup', token],
    queryFn: () => lookupInvite(token),
    retry: false,
  });

  const claim = useMutation({
    mutationFn: (displayName: string) => claimParticipant(token, displayName),
    onSuccess: ({ sessionId, participantToken }) => {
      try {
        localStorage.setItem(`wisp:participant:${sessionId}`, participantToken);
      } catch {}
      window.location.replace(`/s/${sessionId}/`);
    },
  });

  if (lookup.isLoading) {
    return (
      <Screen>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Screen>
    );
  }

  if (lookup.isError || !lookup.data) {
    return (
      <Screen>
        <div className="text-base font-medium text-destructive">{t('join.error')}</div>
      </Screen>
    );
  }

  const trimmed = name.trim();
  const disabled = !trimmed || claim.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) {
      return;
    }

    claim.mutate(trimmed);
  }

  return (
    <Screen>
      <form onSubmit={submit} className="w-full max-w-sm flex-col gap-4 flex">
        <div className="text-center">
          <div className="text-lg font-semibold">{t('join.title')}</div>
          <p className="text-sm text-muted-foreground">{t('join.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="join-name" className="font-medium">
            {t('join.nameLabel')}
          </label>
          <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('join.namePlaceholder')} maxLength={64} autoFocus />
        </div>
        {claim.isError ? <p className="text-sm text-destructive">{t('join.error')}</p> : null}
        <Button type="submit" disabled={disabled}>
          {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {claim.isPending ? t('join.joining') : t('join.submit')}
        </Button>
      </form>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">{children}</div>
    </div>
  );
}
