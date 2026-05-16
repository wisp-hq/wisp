import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type PwaInstallStatus = { state: 'unsupported' } | { state: 'installed' } | { state: 'ios-manual' } | { state: 'prompt'; prompt: () => Promise<'accepted' | 'dismissed'> };

function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.matchMedia?.('(display-mode: standalone)').matches) {
    return true;
  }

  // iOS Safari exposes this non-standard flag instead of display-mode.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true;
  }

  // iPadOS 13+ reports as Mac; disambiguate via touch support.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function usePwaInstall(): PwaInstallStatus {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return { state: 'installed' };
  }

  if (deferred) {
    return {
      state: 'prompt',
      prompt: async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') {
          setDeferred(null);
        }

        return outcome;
      },
    };
  }

  if (isIos()) {
    return { state: 'ios-manual' };
  }

  return { state: 'unsupported' };
}
