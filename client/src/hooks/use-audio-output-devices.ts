import { useCallback, useEffect, useState } from 'react';

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

const VIRTUAL_DEVICE_IDS = new Set(['', 'default', 'communications']);

// Browsers expose `setSinkId` on HTMLMediaElement when output device routing
// is supported (Chromium-based + Firefox 116+). Older Safari has no equivalent.
export function isAudioOutputSelectionSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return typeof (HTMLMediaElement.prototype as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === 'function';
}

export function useAudioOutputDevices(enabled: boolean): { devices: AudioOutputDevice[]; refresh: () => Promise<void> } {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const outs = all.filter((d) => d.kind === 'audiooutput' && !VIRTUAL_DEVICE_IDS.has(d.deviceId)).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output ${i + 1}` }));
      setDevices(outs);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    refresh();
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [enabled, refresh]);

  return { devices, refresh };
}
