import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { SessionRecord } from '@/lib/types';

export const sessionsCollection = createCollection(
  pocketbaseCollectionOptions({
    id: 'sessions',
    recordService: pb.collection<SessionRecord>('sessions'),
    options: { sort: '-created' },
  }),
);
