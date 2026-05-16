import { useCallback, useEffect, useState } from 'react';

export interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

const VIRTUAL_DEVICE_IDS = new Set(['', 'default', 'communications']);

export function useMicrophoneDevices(): { devices: MicrophoneDevice[]; refresh: () => Promise<void> } {
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput' && !VIRTUAL_DEVICE_IDS.has(d.deviceId)).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      setDevices(mics);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  return { devices, refresh };
}
