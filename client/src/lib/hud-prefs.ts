import { useCallback, useEffect, useState } from 'react';
import { pb } from '@/lib/pb';
import { DEFAULT_HUD_PREFS, type HudPrefs, type UserRecord } from '@/lib/types';

// Reactive snapshot of the auth user's HUD preferences. Wraps pb.authStore so
// every consumer reflects the same source of truth, and writes update PB
// (persisted across devices/sessions) with an optimistic local commit.

function readCurrent(): HudPrefs {
  const user = pb.authStore.record as UserRecord | null;
  return { ...DEFAULT_HUD_PREFS, ...(user?.hudPrefs ?? {}) };
}

export function useHudPrefs(): [HudPrefs, (patch: Partial<HudPrefs>) => Promise<void>] {
  const [prefs, setPrefs] = useState<HudPrefs>(() => readCurrent());

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      setPrefs(readCurrent());
    });
    return () => unsubscribe();
  }, []);

  const update = useCallback(async (patch: Partial<HudPrefs>) => {
    const user = pb.authStore.record as UserRecord | null;
    if (!user) {
      return;
    }

    const next: HudPrefs = { ...readCurrent(), ...patch };
    // Optimistic: refresh the auth record so any other consumer sees the new
    // value before the network round-trip resolves.
    pb.authStore.save(pb.authStore.token, { ...user, hudPrefs: next });
    try {
      await pb.collection<UserRecord>('users').update(user.id, { hudPrefs: next });
    } catch (err) {
      // Roll back if the update failed.
      pb.authStore.save(pb.authStore.token, user);
      throw err;
    }
  }, []);

  return [prefs, update];
}
