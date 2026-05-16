import { useEffect, useRef } from 'react';

type Modifiers = {
  meta?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
};

type Bindings = Record<string, () => void>;

const codeForLetter: Record<string, string> = {};
type KeyboardWithLayout = { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } };
(navigator as Navigator & KeyboardWithLayout).keyboard
  ?.getLayoutMap?.()
  .then((layout) =>
    layout.forEach((label, code) => {
      codeForLetter[label.toLowerCase()] = code;
    }),
  )
  .catch(() => undefined);

function codeFor(letter: string): string {
  return codeForLetter[letter] ?? `Key${letter.toUpperCase()}`;
}

export function useKeyboardShortcuts(modifiers: Modifiers, bindings: Bindings) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (modifiers.meta !== undefined && e.metaKey !== modifiers.meta) {
        return;
      }

      if (modifiers.alt !== undefined && e.altKey !== modifiers.alt) {
        return;
      }

      if (modifiers.ctrl !== undefined && e.ctrlKey !== modifiers.ctrl) {
        return;
      }

      if (modifiers.shift !== undefined && e.shiftKey !== modifiers.shift) {
        return;
      }

      for (const [letter, handler] of Object.entries(bindingsRef.current)) {
        if (e.code === codeFor(letter)) {
          e.preventDefault();
          e.stopPropagation();
          handler();
          return;
        }
      }
    }
    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('keydown', onKeydown, true);
    };
  }, [modifiers.meta, modifiers.alt, modifiers.ctrl, modifiers.shift]);
}
