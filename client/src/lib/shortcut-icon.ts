import { DEFAULT_REGION, type Region, type ShortcutIconURL } from '@/lib/types';

// Picks the cover-art URL to show for a shortcut: prefer the URL whose region
// matches the user's preference, otherwise fall back to the first available
// entry. Returns null when the shortcut has no icon entries at all.
export function pickShortcutIcon(iconUrls: ShortcutIconURL[] | null | undefined, region: Region | '' | null | undefined): string | null {
  if (!iconUrls || iconUrls.length === 0) {
    return null;
  }

  const preferred = (region || DEFAULT_REGION) as string;
  const match = iconUrls.find((entry) => entry.region === preferred);
  return (match ?? iconUrls[0]).url;
}
