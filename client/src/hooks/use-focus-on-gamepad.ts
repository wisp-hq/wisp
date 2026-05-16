import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';

export function useFocusOnGamepad(focusKey: string | null) {
  useEffect(() => {
    if (!focusKey) {
      return;
    }

    const focusFirst = () => {
      if (doesFocusableExist(focusKey)) {
        setFocus(focusKey);
      }
    };
    window.addEventListener('gamepadconnected', focusFirst);
    if (navigator.getGamepads?.().some((p) => p !== null)) {
      focusFirst();
    }

    return () => window.removeEventListener('gamepadconnected', focusFirst);
  }, [focusKey]);
}
