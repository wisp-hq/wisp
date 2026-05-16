import { createCollection } from '@tanstack/db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pb';
import type { CatalogSourceRecord } from '@/lib/types';

export const catalogSourcesCollection = createCollection(
  pocketbaseCollectionOptions<CatalogSourceRecord>({
    id: 'catalog_sources',
    recordService: pb.collection<CatalogSourceRecord>('catalog_sources'),
    options: { sort: 'name' },
  }),
);
