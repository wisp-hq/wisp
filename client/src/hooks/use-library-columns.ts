import { useMediaQuery } from '@/lib/use-media-query';

// Mirrors the Tailwind classes on the library grid: `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6`.
// `gap` is the matching tile spacing in px (`gap-3` = 0.75rem = 12px, `sm:gap-4` = 16px).
export interface LibraryColumns {
  count: number;
  gap: number;
}

export function useLibraryColumns(): LibraryColumns {
  const isSm = useMediaQuery('(min-width: 640px)');
  const isLg = useMediaQuery('(min-width: 1024px)');

  if (isLg) {
    return { count: 6, gap: 16 };
  }

  if (isSm) {
    return { count: 4, gap: 16 };
  }

  return { count: 3, gap: 12 };
}
