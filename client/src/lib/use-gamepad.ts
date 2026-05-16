import { useEffect, useState } from 'react';
import type { GamepadLayout } from '@/lib/types';

const DEAD_ZONE = 0.5;
const INITIAL_REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 120;

// Face-button indices in the W3C "standard" gamepad mapping:
//   0 = BOTTOM face button  (Xbox "A", PS "Cross",  Nintendo "B")
//   1 = RIGHT  face button  (Xbox "B", PS "Circle", Nintendo "A")
// Nintendo (the original) confirms on the right; Xbox + Sony (Western default)
// confirm on the bottom. Sony differs only in displayed glyph (✕/○).
function buttonsForLayout(layout: GamepadLayout): { confirm: number; cancel: number } {
  return layout === 'nintendo' ? { confirm: 1, cancel: 0 } : { confirm: 0, cancel: 1 };
}

export function buttonLabels(layout: GamepadLayout): { confirm: string; cancel: string } {
  if (layout === 'sony') {
    return { confirm: '✕', cancel: '○' };
  }

  return { confirm: 'A', cancel: 'B' };
}

export function detectLayout(id: string): GamepadLayout {
  if (/vendor:\s*057e/i.test(id)) {
    return 'nintendo';
  }

  if (/vendor:\s*054c/i.test(id)) {
    return 'sony';
  }

  if (/vendor:\s*045e/i.test(id)) {
    return 'xbox';
  }

  const lower = id.toLowerCase();
  if (/switch|joy.?con|pro controller/.test(lower)) {
    return 'nintendo';
  }

  if (/dualshock|dualsense|playstation/.test(lower)) {
    return 'sony';
  }

  if (/xbox|xinput/.test(lower)) {
    return 'xbox';
  }

  return 'xbox';
}

export function resolveLayoutFor(id: string, overrides: Record<string, GamepadLayout>): GamepadLayout {
  return overrides[id] ?? detectLayout(id);
}

type DirKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

interface RepeatState {
  key: DirKey | null;
  firstFiredAt: number;
  lastFiredAt: number;
}

function dispatchKey(key: string) {
  const target = (document.activeElement as HTMLElement) ?? document.body;
  const init: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
}

function activateFocused() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) {
    return;
  }

  // Radix DropdownMenuTrigger (and most Radix popper triggers) opens on
  // `pointerdown`, NOT on `click`. So fire a full mouse-pointer sequence —
  // pointerdown/pointerup/click — to cover both Radix and plain buttons.
  // We mark pointerType='mouse' so app-tile's useTapDropdown (which suppresses
  // touch/pen events to handle scroll gestures) lets it through to Radix.
  const rect = el.getBoundingClientRect();
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  el.click();
}

function readDirection(gp: Gamepad): DirKey | null {
  if (gp.buttons[12]?.pressed) {
    return 'ArrowUp';
  }

  if (gp.buttons[13]?.pressed) {
    return 'ArrowDown';
  }

  if (gp.buttons[14]?.pressed) {
    return 'ArrowLeft';
  }

  if (gp.buttons[15]?.pressed) {
    return 'ArrowRight';
  }

  const [lx = 0, ly = 0] = gp.axes;
  if (Math.abs(lx) > Math.abs(ly)) {
    if (lx > DEAD_ZONE) {
      return 'ArrowRight';
    }

    if (lx < -DEAD_ZONE) {
      return 'ArrowLeft';
    }
  } else {
    if (ly > DEAD_ZONE) {
      return 'ArrowDown';
    }

    if (ly < -DEAD_ZONE) {
      return 'ArrowUp';
    }
  }

  return null;
}

export interface ConnectedGamepad {
  index: number;
  id: string;
  buttons: number;
  axes: number;
}

// Snapshot of currently-connected gamepads. Re-reads on connect/disconnect.
// Browsers don't fire connect events until the user gives the pad input, so
// `navigator.getGamepads()` may return an empty array on first mount even if
// pads are physically plugged in.
export function useConnectedGamepads(): ConnectedGamepad[] {
  const [pads, setPads] = useState<ConnectedGamepad[]>([]);
  useEffect(() => {
    const refresh = () => {
      const list = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => p !== null).map((p) => ({ index: p.index, id: p.id, buttons: p.buttons.length, axes: p.axes.length }));
      setPads(list);
    };
    refresh();
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    return () => {
      window.removeEventListener('gamepadconnected', refresh);
      window.removeEventListener('gamepaddisconnected', refresh);
    };
  }, []);
  return pads;
}

export function useGamepad(resolveLayout: (id: string) => GamepadLayout) {
  useEffect(() => {
    let raf = 0;
    let prevButtons: boolean[] = [];
    const dir: RepeatState = { key: null, firstFiredAt: 0, lastFiredAt: 0 };

    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = pads.find((p): p is Gamepad => p !== null);
      if (gp) {
        const { confirm: confirmIdx, cancel: cancelIdx } = buttonsForLayout(resolveLayout(gp.id));
        const currentDir = readDirection(gp);
        const now = performance.now();
        if (currentDir !== dir.key) {
          dir.key = currentDir;
          dir.firstFiredAt = now;
          dir.lastFiredAt = now;
          if (currentDir) {
            dispatchKey(currentDir);
          }
        } else if (currentDir) {
          const heldFor = now - dir.firstFiredAt;
          const sinceLast = now - dir.lastFiredAt;
          if (heldFor > INITIAL_REPEAT_DELAY_MS && sinceLast > REPEAT_INTERVAL_MS) {
            dir.lastFiredAt = now;
            dispatchKey(currentDir);
          }
        }

        const confirmPressed = gp.buttons[confirmIdx]?.pressed ?? false;
        if (confirmPressed && !prevButtons[confirmIdx]) {
          activateFocused();
        }

        prevButtons[confirmIdx] = confirmPressed;

        const cancelPressed = gp.buttons[cancelIdx]?.pressed ?? false;
        if (cancelPressed && !prevButtons[cancelIdx]) {
          dispatchKey('Escape');
        }

        prevButtons[cancelIdx] = cancelPressed;
      } else {
        prevButtons = [];
        dir.key = null;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resolveLayout]);
}
