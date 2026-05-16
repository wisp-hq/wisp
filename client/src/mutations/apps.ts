import { appsCollection } from '@/collections';
import { pb } from '@/lib/pb';
import type { AppOverrides, AppRecord, AppSpec } from '@/lib/types';

export interface CreateAppInput {
  slug: string;
  catalogSource: string;
  version: string;
  spec: AppOverrides | AppSpec;
}

export async function createApp(input: CreateAppInput): Promise<void> {
  await pb.collection<AppRecord>('apps').create({
    slug: input.slug,
    catalogSource: input.catalogSource,
    version: input.version,
    spec: input.spec,
  });
}

export interface UpdateAppInput {
  spec: AppOverrides | AppSpec;
}

export async function updateApp(id: string, input: UpdateAppInput): Promise<void> {
  await pb.collection<AppRecord>('apps').update(id, {
    spec: input.spec,
  });
}

export function deleteApp(appId: string): void {
  appsCollection.delete(appId);
}
