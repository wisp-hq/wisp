import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';

// On touch, Radix's DropdownMenuTrigger opens the menu on `pointerdown` — which
// fires the moment a finger lands, before the browser knows whether the user is
// starting a scroll. We suppress Radix's auto-open for touch/pen and toggle
// ourselves on `pointerup`, but only if the finger didn't drift past a small
// threshold.
export function useTapDropdown(disabled = false) {
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const triggerProps = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') {
        return;
      }

      start.current = { x: event.clientX, y: event.clientY };
      moved.current = false;
      event.preventDefault();
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' || !start.current) {
        return;
      }

      if (Math.abs(event.clientX - start.current.x) > 8 || Math.abs(event.clientY - start.current.y) > 8) {
        moved.current = true;
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') {
        return;
      }

      const wasMoved = moved.current;
      start.current = null;
      moved.current = false;
      if (!wasMoved && !disabled) {
        setOpen((current) => !current);
      }
    },
    onPointerCancel: () => {
      start.current = null;
      moved.current = false;
    },
  };

  return { open, setOpen, triggerProps };
}
