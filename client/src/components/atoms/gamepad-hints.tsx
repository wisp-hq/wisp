import { useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useHudPrefs } from '@/lib/hud-prefs';
import { buttonLabels, resolveLayoutFor } from '@/lib/use-gamepad';
import { GamepadHint } from './gamepad-hint';

function useFirstConnectedGamepadId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p): p is Gamepad => p !== null);
      setId(pad ? pad.id : null);
    };
    refresh();
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    return () => {
      window.removeEventListener('gamepadconnected', refresh);
      window.removeEventListener('gamepaddisconnected', refresh);
    };
  }, []);
  return id;
}

export function GamepadHints() {
  const [prefs] = useHudPrefs();
  const padId = useFirstConnectedGamepadId();
  const pathname = useLocation({ select: ({ pathname }) => pathname });
  if (!padId || pathname.startsWith('/hud/')) {
    return null;
  }

  const { confirm, cancel } = buttonLabels(resolveLayoutFor(padId, prefs.gamepadLayouts));
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full border bg-background/85 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
      <GamepadHint glyph={confirm} action="Confirm" />
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <GamepadHint glyph={cancel} action="Back" />
    </div>
  );
}
