import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { type CatalogEntry, listCatalog } from '@/clients/catalog.client';
import { catalogSourcesCollection } from '@/collections';

export function useCatalog() {
  const { data: sources = [] } = useLiveQuery((q) => q.from({ s: catalogSourcesCollection }));
  const sourcesSig = sources
    .map((s) => `${s.id}:${s.enabled ? '1' : '0'}`)
    .sort()
    .join(',');

  return useQuery<CatalogEntry[]>({
    queryKey: ['catalog', sourcesSig],
    queryFn: ({ signal }) => listCatalog(signal),
    staleTime: 10 * 60 * 1000,
  });
}
