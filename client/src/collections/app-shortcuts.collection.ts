import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { AppShortcutRecord } from '@/lib/types';

export const appShortcutsCollection = createCollection(
  pocketbaseCollectionOptions<AppShortcutRecord>({
    id: 'app_shortcuts',
    recordService: pb.collection<AppShortcutRecord>('app_shortcuts'),
    options: { sort: 'name' },
  }),
);
