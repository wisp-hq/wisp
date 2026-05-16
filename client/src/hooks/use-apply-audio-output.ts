import { useEffect } from 'react';

// Routes every <audio>/<video> in the parent window to the chosen output device.
// Re-applies whenever Selkies (in)serts new media elements, so a freshly-mounted
// video sink picks up the user's preference automatically.
export function useApplyAudioOutput(deviceId: string): void {
  useEffect(() => {
    let parentDoc: Document;
    try {
      parentDoc = window.parent.document;
    } catch {
      return;
    }

    function applyTo(el: HTMLMediaElement) {
      const withSink = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof withSink.setSinkId !== 'function') {
        return;
      }
      withSink.setSinkId(deviceId).catch(() => {});
    }

    function applyAll() {
      for (const el of parentDoc.querySelectorAll<HTMLMediaElement>('audio, video')) {
        applyTo(el);
      }
    }

    applyAll();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            applyTo(node);
          } else if (node instanceof HTMLElement) {
            for (const el of node.querySelectorAll<HTMLMediaElement>('audio, video')) {
              applyTo(el);
            }
          }
        }
      }
    });
    observer.observe(parentDoc.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [deviceId]);
}
