import { useTranslation } from 'react-i18next';
import { RowSeparator } from '@/components/atoms/row-separator';
import { SelectRow } from '@/components/atoms/select-row';
import { ToggleRow } from '@/components/atoms/toggle-row';
import { useHudPrefs } from '@/lib/hud-prefs';
import type { KeyboardLayout } from '@/lib/types';

type ClipboardMode = 'off' | 'in' | 'out' | 'both';

const KEYBOARD_LAYOUTS: ReadonlyArray<KeyboardLayout> = ['auto', 'qwerty', 'azerty'];

function clipboardMode(inEnabled: boolean, outEnabled: boolean): ClipboardMode {
  if (inEnabled && outEnabled) {
    return 'both';
  }

  if (inEnabled) {
    return 'in';
  }

  if (outEnabled) {
    return 'out';
  }

  return 'off';
}

function clipboardFlags(mode: string): { clipboardIn: boolean; clipboardOut: boolean } {
  return {
    clipboardIn: mode === 'in' || mode === 'both',
    clipboardOut: mode === 'out' || mode === 'both',
  };
}

interface Props {
  isOwner?: boolean;
}

export function GeneralTab({ isOwner = true }: Props) {
  const { t } = useTranslation();
  const [prefs, update] = useHudPrefs();
  const mode = clipboardMode(prefs.clipboardIn, prefs.clipboardOut);

  return (
    <div className="flex flex-col gap-1">
      {isOwner ? (
        <>
          <ToggleRow label={t('hud.overlay.general.keepAlive')} description={t('hud.overlay.general.keepAliveDescription')} checked={prefs.keepAlive} onChange={(next) => void update({ keepAlive: next })} />
          <RowSeparator />
        </>
      ) : null}
      <SelectRow
        label={t('hud.overlay.clipboardMode')}
        description={t('hud.overlay.clipboardModeDescription')}
        value={mode}
        options={[
          { value: 'off', label: t('hud.overlay.clipboardOff') },
          { value: 'in', label: t('hud.overlay.clipboardIn') },
          { value: 'out', label: t('hud.overlay.clipboardOut') },
          { value: 'both', label: t('hud.overlay.clipboardBoth') },
        ]}
        onChange={(next) => void update(clipboardFlags(next))}
      />
      {mode !== 'off' ? <ToggleRow label={t('hud.overlay.binaryClipboard')} description={t('hud.overlay.binaryClipboardDescription')} checked={prefs.binaryClipboard} onChange={(next) => void update({ binaryClipboard: next })} /> : null}
      <RowSeparator />
      <SelectRow
        label={t('hud.overlay.keyboardLayout')}
        description={t('hud.overlay.keyboardLayoutDescription')}
        value={prefs.keyboardLayout}
        options={KEYBOARD_LAYOUTS.map((value) => ({ value, label: t(`hud.overlay.keyboardLayouts.${value}` as const) }))}
        onChange={(next) => void update({ keyboardLayout: next as KeyboardLayout })}
      />
      <RowSeparator />
      <ToggleRow label={t('hud.overlay.floatingMenuButton')} description={t('hud.overlay.floatingMenuButtonDescription')} checked={!prefs.hideHandle} onChange={(next) => void update({ hideHandle: !next })} />
    </div>
  );
}
