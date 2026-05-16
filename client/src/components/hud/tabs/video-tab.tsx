import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '@/components/atoms/collapsible-section';
import { RowSeparator } from '@/components/atoms/row-separator';
import { SelectRow } from '@/components/atoms/select-row';
import { SliderRow } from '@/components/atoms/slider-row';
import { ToggleRow } from '@/components/atoms/toggle-row';
import { useHudPrefs } from '@/lib/hud-prefs';
import type { SelkiesBridge } from '@/lib/selkies-bridge';

interface Props {
  bridge?: SelkiesBridge;
}

const FRAMERATE_OPTIONS = [
  { value: '30', label: '30 FPS' },
  { value: '60', label: '60 FPS' },
  { value: '90', label: '90 FPS' },
  { value: '120', label: '120 FPS' },
];

const RESOLUTION_PRESETS = [
  { width: 1280, height: 720, label: '1280 × 720 (HD)' },
  { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' },
  { width: 2560, height: 1440, label: '2560 × 1440 (QHD)' },
  { width: 3840, height: 2160, label: '3840 × 2160 (4K)' },
];

const RESOLUTION_OPTIONS = RESOLUTION_PRESETS.map((p) => ({ value: `${p.width}x${p.height}`, label: p.label }));

const RATE_CONTROL_OPTIONS = [
  { value: 'crf', label: 'CRF' },
  { value: 'cbr', label: 'CBR' },
];

const DPI_OPTIONS = [
  { value: '96', label: '100%' },
  { value: '120', label: '125%' },
  { value: '144', label: '150%' },
  { value: '168', label: '175%' },
  { value: '192', label: '200%' },
  { value: '216', label: '225%' },
  { value: '240', label: '250%' },
  { value: '264', label: '275%' },
  { value: '288', label: '300%' },
];

function nearestPreset(width: number, height: number) {
  let best = RESOLUTION_PRESETS[1];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of RESOLUTION_PRESETS) {
    const dist = Math.abs(p.width * p.height - width * height);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function encoderFamily(name: string | null): 'jpeg' | 'h264' | 'other' | 'unknown' {
  if (!name) {
    return 'unknown';
  }
  const lower = name.toLowerCase();
  if (lower.includes('jpeg')) {
    return 'jpeg';
  }
  if (lower.includes('h264') || lower.includes('264') || lower.includes('avc')) {
    return 'h264';
  }
  return 'other';
}

function useParentWindowSize() {
  const [size, setSize] = useState(() => ({
    width: window.parent?.innerWidth ?? window.innerWidth,
    height: window.parent?.innerHeight ?? window.innerHeight,
  }));
  useEffect(() => {
    const target = window.parent ?? window;
    const onResize = () => {
      setSize({ width: target.innerWidth, height: target.innerHeight });
    };
    target.addEventListener('resize', onResize);
    return () => target.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function CurrentValueRow({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <div className="-mt-1.5 flex items-center px-3 pb-2 text-xs text-muted-foreground">
      <span className="ml-auto font-mono tabular-nums">{t('hud.overlay.currentValue', { value })}</span>
    </div>
  );
}

export function VideoTab({ bridge }: Props) {
  const { t } = useTranslation();
  const [prefs, update] = useHudPrefs();
  const windowSize = useParentWindowSize();
  const encoderInfo = bridge?.serverSettings?.encoder;
  const encoderOptions = (encoderInfo?.allowed ?? []).map((v) => ({ value: v, label: v }));
  const encoderValue = encoderInfo?.value ?? '';
  const activeEncoder = bridge?.stats?.encoderName || encoderValue || null;
  const currentBitrate = bridge?.serverSettings?.video_bitrate?.value;
  const family = encoderFamily(activeEncoder);

  const manualResolutionKey = prefs.manualResolution ? `${prefs.manualResolution.width}x${prefs.manualResolution.height}` : '';

  return (
    <div className="flex flex-col gap-1">
      <ToggleRow
        label={t('hud.overlay.autoResolution')}
        description={t('hud.overlay.autoResolutionDescription')}
        checked={prefs.manualResolution === null}
        onChange={(next) => {
          if (next) {
            void update({ manualResolution: null });
          } else {
            const preset = nearestPreset(windowSize.width, windowSize.height);
            void update({ manualResolution: { width: preset.width, height: preset.height } });
          }
        }}
      />
      {prefs.manualResolution === null ? (
        <CurrentValueRow value={`${windowSize.width} × ${windowSize.height}`} />
      ) : (
        <SelectRow
          label={t('hud.overlay.resolution')}
          description={t('hud.overlay.resolutionDescription')}
          value={manualResolutionKey}
          options={RESOLUTION_OPTIONS}
          onChange={(next) => {
            const [w, h] = next.split('x').map(Number);
            void update({ manualResolution: { width: w, height: h } });
          }}
        />
      )}
      <ToggleRow label={t('hud.overlay.autoVideoBitrate')} description={t('hud.overlay.autoVideoBitrateDescription')} checked={prefs.videoBitrateAuto} onChange={(next) => void update({ videoBitrateAuto: next })} />
      {prefs.videoBitrateAuto ? (
        typeof currentBitrate === 'number' ? (
          <CurrentValueRow value={`${currentBitrate} Mbps`} />
        ) : null
      ) : (
        <SliderRow label={t('hud.overlay.videoBitrate')} description={t('hud.overlay.videoBitrateDescription')} value={prefs.videoBitrate} min={1} max={50} step={1} unit="Mbps" onChange={(next) => void update({ videoBitrate: next })} />
      )}
      <SelectRow label={t('hud.overlay.framerate')} description={t('hud.overlay.framerateDescription')} value={String(prefs.framerate)} options={FRAMERATE_OPTIONS} onChange={(next) => void update({ framerate: Number(next) })} />
      {bridge && encoderOptions.length > 0 ? (
        <>
          <RowSeparator />
          <SelectRow label={t('hud.overlay.encoder')} description={t('hud.overlay.encoderDescription')} value={encoderValue} options={encoderOptions} onChange={(next) => bridge.setEncoder(next)} />
        </>
      ) : activeEncoder ? (
        <>
          <RowSeparator />
          <div className="flex items-center gap-4 rounded-md px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('hud.overlay.encoder')}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t('hud.overlay.encoderDescription')}</div>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{activeEncoder}</span>
          </div>
        </>
      ) : null}
      <CollapsibleSection label={t('hud.overlay.advanced')}>
        <SelectRow label={t('hud.overlay.rateControlMode')} description={t('hud.overlay.rateControlModeDescription')} value={prefs.rateControlMode} options={RATE_CONTROL_OPTIONS} onChange={(next) => void update({ rateControlMode: next as 'crf' | 'cbr' })} />
        {family === 'h264' ? <SliderRow label={t('hud.overlay.h264Crf')} description={t('hud.overlay.h264CrfDescription')} value={prefs.h264Crf} min={5} max={50} step={1} onChange={(next) => void update({ h264Crf: next })} /> : null}
        {family === 'h264' ? <ToggleRow label={t('hud.overlay.h264StreamingMode')} description={t('hud.overlay.h264StreamingModeDescription')} checked={prefs.h264StreamingMode} onChange={(next) => void update({ h264StreamingMode: next })} /> : null}
        {family === 'jpeg' ? <SliderRow label={t('hud.overlay.jpegQuality')} description={t('hud.overlay.jpegQualityDescription')} value={prefs.jpegQuality} min={1} max={100} step={1} unit="%" onChange={(next) => void update({ jpegQuality: next })} /> : null}
        <ToggleRow label={t('hud.overlay.paintOverQuality')} description={t('hud.overlay.paintOverQualityDescription')} checked={prefs.paintOverQuality} onChange={(next) => void update({ paintOverQuality: next })} />
        <SelectRow label={t('hud.overlay.scalingDpi')} description={t('hud.overlay.scalingDpiDescription')} value={String(prefs.scalingDpi)} options={DPI_OPTIONS} onChange={(next) => void update({ scalingDpi: Number(next) })} />
        <ToggleRow label={t('hud.overlay.cssScaling')} description={t('hud.overlay.cssScalingDescription')} checked={prefs.cssScaling} onChange={(next) => void update({ cssScaling: next })} />
        <ToggleRow label={t('hud.overlay.browserCursors')} description={t('hud.overlay.browserCursorsDescription')} checked={prefs.browserCursors} onChange={(next) => void update({ browserCursors: next })} />
        <ToggleRow label={t('hud.overlay.useCpu')} description={t('hud.overlay.useCpuDescription')} checked={prefs.useCpu} onChange={(next) => void update({ useCpu: next })} />
      </CollapsibleSection>
    </div>
  );
}
