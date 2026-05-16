import { type HttpDelegate, universalClient, withMethods } from 'universal-client';
import { withAuthFetchDelegate } from '@/lib/client';

export interface ImageMatch {
  ref: string;
  description?: string;
  official?: boolean;
  stars?: number;
  source: string;
}

export interface TagMatch {
  tag: string;
  pushed?: string;
}

const registryClient = universalClient(
  withAuthFetchDelegate('/api/registry'),
  withMethods(({ delegate }: { delegate: HttpDelegate }) => ({
    searchImages: (q: string, signal?: AbortSignal, limit = 10) => delegate.get<ImageMatch[]>('/search', { params: { q, limit }, signal }),
    listTags: (image: string, q = '', signal?: AbortSignal, limit = 20) => delegate.get<TagMatch[]>('/tags', { params: { image, q, limit }, signal }),
  })),
);

export const { searchImages, listTags } = registryClient;
