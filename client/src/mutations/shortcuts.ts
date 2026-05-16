import { pb } from '@/lib/pb';
import type { AppShortcutRecord } from '@/lib/types';

export async function setShortcutHidden(id: string, hidden: boolean): Promise<void> {
  await pb.collection<AppShortcutRecord>('app_shortcuts').update(id, { hidden });
}

export async function setShortcutsHidden(ids: string[], hidden: boolean): Promise<void> {
  await Promise.all(ids.map((id) => setShortcutHidden(id, hidden)));
}
