import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { UserRecord } from '@/lib/types';

export const usersCollection = createCollection(
  pocketbaseCollectionOptions({
    id: 'users',
    recordService: pb.collection<UserRecord>('users'),
    options: {
      sort: 'name',
    },
  }),
);
