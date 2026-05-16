import { useEffect } from 'react';

export function useParentMessage(handler: (event: MessageEvent) => void) {
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window.parent || ev.origin !== window.location.origin) {
        return;
      }

      handler(ev);
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [handler]);
}
