import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { SessionParticipantRecord } from '@/lib/types';

export const sessionParticipantsCollection = createCollection(
  pocketbaseCollectionOptions({
    id: 'session_participants',
    recordService: pb.collection<SessionParticipantRecord>('session_participants'),
    options: { sort: '-created' },
  }),
);
