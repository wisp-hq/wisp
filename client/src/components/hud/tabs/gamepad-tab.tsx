import { Gamepad2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RowSeparator } from '@/components/atoms/row-separator';
import { ToggleRow } from '@/components/atoms/toggle-row';
import { useHudPrefs } from '@/lib/hud-prefs';
import type { GamepadLayout } from '@/lib/types';
import { resolveLayoutFor, useConnectedGamepads } from '@/lib/use-gamepad';

const GAMEPAD_LAYOUTS: ReadonlyArray<GamepadLayout> = ['nintendo', 'xbox', 'sony'];

export function GamepadTab() {
  const { t } = useTranslation();
  const [prefs, update] = useHudPrefs();
  const pads = useConnectedGamepads();

  const setPadLayout = (id: string, next: GamepadLayout) => {
    void update({ gamepadLayouts: { ...prefs.gamepadLayouts, [id]: next } });
  };

  return (
    <div className="flex flex-col gap-1">
      <ToggleRow label={t('hud.overlay.gamepadEnabled')} description={t('hud.overlay.gamepadEnabledDescription')} checked={prefs.gamepadEnabled} onChange={(next) => void update({ gamepadEnabled: next })} />
      {prefs.gamepadEnabled ? (
        <>
          <RowSeparator />
          <div className="px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('hud.overlay.connectedGamepads')}</div>
            {pads.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('hud.overlay.noGamepadConnected')}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {pads.map((p) => (
                  <li key={p.id} className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="font-medium tabular-nums">P{p.index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={p.id}>
                        {prettifyGamepadId(p.id)}
                      </span>
                    </div>
                    <select
                      value={resolveLayoutFor(p.id, prefs.gamepadLayouts)}
                      onChange={(e) => setPadLayout(p.id, e.target.value as GamepadLayout)}
                      className="mt-2 w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t('hud.overlay.gamepadLayout')}
                    >
                      {GAMEPAD_LAYOUTS.map((value) => (
                        <option key={value} value={value}>
                          {t(`hud.overlay.layouts.${value}` as const)}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Trim Linux's verbose "Vendor Inc. Pad Model (Vendor: 0xAAAA Product: 0xBBBB)" → "Pad Model".
function prettifyGamepadId(id: string): string {
  const parenIdx = id.indexOf('(');
  return (parenIdx > 0 ? id.slice(0, parenIdx) : id).trim() || id;
}
