import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { AppRecord } from '@/lib/types';

export const appsCollection = createCollection(
  pocketbaseCollectionOptions<AppRecord>({
    id: 'apps',
    recordService: pb.collection<AppRecord>('apps'),
    options: { sort: 'slug' },
  }),
);
