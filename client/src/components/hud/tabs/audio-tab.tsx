import { useTranslation } from 'react-i18next';
import { RowSeparator } from '@/components/atoms/row-separator';
import { SelectRow } from '@/components/atoms/select-row';
import { ToggleRow } from '@/components/atoms/toggle-row';
import { isAudioOutputSelectionSupported, useAudioOutputDevices } from '@/hooks/use-audio-output-devices';
import { useMicrophoneDevices } from '@/hooks/use-microphone-devices';
import { useHudPrefs } from '@/lib/hud-prefs';

export function AudioTab() {
  const { t } = useTranslation();
  const [prefs, update] = useHudPrefs();
  const { devices: microphones, refresh: refreshMicrophones } = useMicrophoneDevices();
  const audioOutputSupported = isAudioOutputSelectionSupported();
  const { devices: outputs } = useAudioOutputDevices(audioOutputSupported && prefs.audioEnabled);

  const micOptions = [{ value: '', label: t('hud.overlay.microphoneDefault') }, ...microphones.map((d) => ({ value: d.deviceId, label: d.label }))];
  const outputOptions = [{ value: '', label: t('hud.overlay.audioOutputDefault') }, ...outputs.map((d) => ({ value: d.deviceId, label: d.label }))];

  async function toggleMicrophone(next: boolean) {
    if (next) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) {
          track.stop();
        }
        await refreshMicrophones();
      } catch {
        return;
      }
    }

    await update({ microphoneEnabled: next });
  }

  return (
    <div className="flex flex-col gap-1">
      <ToggleRow label={t('hud.overlay.audio')} description={t('hud.overlay.audioDescription')} checked={prefs.audioEnabled} onChange={(next) => void update({ audioEnabled: next })} />
      {audioOutputSupported && prefs.audioEnabled ? <SelectRow label={t('hud.overlay.audioOutput')} description={t('hud.overlay.audioOutputDescription')} value={prefs.audioOutputDeviceId} options={outputOptions} onChange={(next) => void update({ audioOutputDeviceId: next })} /> : null}
      <RowSeparator />
      <ToggleRow label={t('hud.overlay.microphone')} description={t('hud.overlay.microphoneDescription')} checked={prefs.microphoneEnabled} onChange={(next) => void toggleMicrophone(next)} />
      {prefs.microphoneEnabled ? <SelectRow label={t('hud.overlay.microphoneDevice')} value={prefs.microphoneDeviceId} options={micOptions} onChange={(next) => void update({ microphoneDeviceId: next })} /> : null}
    </div>
  );
}
