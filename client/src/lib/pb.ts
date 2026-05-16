import PocketBase from 'pocketbase';
import type { UserRecord } from './types';

// In dev Vite proxies /api, /_, /s to the Go launcher; in prod everything is same-origin.
// Using a relative base URL lets PocketBase build correct absolute URLs in both cases.
export const pb = new PocketBase('/');
pb.autoCancellation(false);

export function avatarUrl(user: UserRecord): string | null {
  if (!user.avatar) {
    return null;
  }

  return pb.files.getURL(user, user.avatar);
}
