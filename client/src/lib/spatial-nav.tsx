import { init, pause, resume } from '@noriginmedia/norigin-spatial-navigation';
import { type ReactNode, useCallback, useEffect } from 'react';
import { useHudPrefs } from '@/lib/hud-prefs';
import { resolveLayoutFor, useGamepad } from './use-gamepad';

let initialized = false;

function ensureInit() {
  if (initialized) {
    return;
  }

  init({
    debug: false,
    visualDebug: false,
    throttle: 0,
    shouldFocusDOMNode: true,
  });
  initialized = true;
}

// Pause spatial navigation when either:
//  - a Radix overlay is open (so its own keyboard handling — arrow keys inside
//    menus/dialogs, Escape to close — isn't fought by norigin)
//  - a text-entry element is focused (so the library doesn't preventDefault on
//    Enter and break implicit form submission, or swallow arrows used for
//    caret movement)
function usePauseOnInteraction() {
  useEffect(() => {
    const OVERLAY_SELECTOR = '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"]';
    let paused = false;

    const isTextEntry = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }

      if (el.isContentEditable) {
        return true;
      }

      const tag = el.tagName;
      if (tag === 'TEXTAREA') {
        return true;
      }

      if (tag === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'checkbox' && type !== 'radio';
      }

      return false;
    };

    const update = () => {
      const shouldPause = document.querySelector(OVERLAY_SELECTOR) !== null || isTextEntry(document.activeElement);
      if (shouldPause && !paused) {
        pause();
        paused = true;
      } else if (!shouldPause && paused) {
        resume();
        paused = false;
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      if (paused) {
        resume();
      }
    };
  }, []);
}

export function SpatialNavProvider({ children }: { children: ReactNode }) {
  ensureInit();
  const [prefs] = useHudPrefs();
  const resolveLayout = useCallback((id: string) => resolveLayoutFor(id, prefs.gamepadLayouts), [prefs.gamepadLayouts]);
  useGamepad(resolveLayout);
  usePauseOnInteraction();
  return <>{children}</>;
}
