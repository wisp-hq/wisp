import { useLiveQuery } from '@tanstack/react-db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getInvite, type InviteResponse, rotateInvite } from '@/clients/invites.client';
import { revokeParticipant } from '@/clients/participants.client';
import { sessionParticipantsCollection } from '@/collections';
import { RowSeparator } from '@/components/atoms/row-separator';
import { pb } from '@/lib/pb';
import type { ParticipantRole } from '@/lib/types';
import { InviteSection } from './sharing/invite-section';
import { ParticipantRow } from './sharing/participant-row';

interface Props {
  sessionId: string;
}

export function SharingTab({ sessionId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inviteKey = ['session-invite', sessionId];

  const { data: allParticipants = [] } = useLiveQuery((q) => q.from({ p: sessionParticipantsCollection }));
  const participants = useMemo(() => allParticipants.filter((participant) => participant.session === sessionId && !participant.revokedAt), [allParticipants, sessionId]);

  const { data: invite, isLoading } = useQuery({
    queryKey: inviteKey,
    queryFn: () => getInvite(sessionId),
    staleTime: Infinity,
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateInvite(sessionId),
    onSuccess: (fresh) => {
      queryClient.setQueryData<InviteResponse | undefined>(inviteKey, fresh);
    },
  });

  const [revoking, setRevoking] = useState<string | null>(null);
  const revokeMutation = useMutation({
    mutationFn: (participantId: string) => revokeParticipant(sessionId, participantId),
    onMutate: (id) => setRevoking(id),
    onSettled: () => setRevoking(null),
  });

  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  // Role updates hit PocketBase directly — the proxy enforces the new role on
  // the participant's next request, the server hook reconciles slot allocation,
  // and the realtime subscription on session_participants propagates the change
  // to every open client.
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: ParticipantRole }) => pb.collection('session_participants').update(id, { role }),
    onMutate: ({ id }) => setChangingRoleId(id),
    onSettled: () => setChangingRoleId(null),
  });

  return (
    <div className="flex flex-col gap-1">
      <InviteSection invite={invite ?? null} loading={isLoading} onRotate={() => rotateMutation.mutate()} rotating={rotateMutation.isPending} />
      <RowSeparator />
      {participants.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">{t('hud.overlay.sharing.noParticipants')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              revoking={revoking === participant.id}
              changingRole={changingRoleId === participant.id}
              onRevoke={() => revokeMutation.mutate(participant.id)}
              onChangeRole={(role) => roleMutation.mutate({ id: participant.id, role })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
