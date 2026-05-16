import { useEffect, useState } from 'react';

// Tracks the parent document's fullscreen state. Cross-window access works
// here because the HUD iframe is same-origin with the Selkies page.
export function useIsFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(() => readState());

  useEffect(() => {
    function update() {
      setIsFullscreen(readState());
    }

    let target: Document | null = null;
    try {
      target = window.parent.document;
    } catch {
      return;
    }

    target.addEventListener('fullscreenchange', update);
    update();
    return () => {
      target?.removeEventListener('fullscreenchange', update);
    };
  }, []);

  return isFullscreen;
}

function readState(): boolean {
  try {
    return !!window.parent.document.fullscreenElement;
  } catch {
    return false;
  }
}
