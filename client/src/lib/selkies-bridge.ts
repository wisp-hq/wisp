import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HudPrefs } from '@/lib/types';

const STATS_POLL_MS = 1000;
const STATS_HISTORY_LEN = 900;

export interface SelkiesStats {
  gpu?: { gpuLoad?: number; gpuMemoryUsed?: number; gpuMemoryTotal?: number; name?: string };
  cpu?: { serverCPUUsage?: number; serverMemoryUsed?: number; serverMemoryTotal?: number };
  network?: { latencyMs?: number; bandwidthMbps?: number };
  clientFps?: number;
  audioBuffer?: number;
  videoBuffer?: number;
  isVideoPipelineActive?: boolean;
  isAudioPipelineActive?: boolean;
  isMicrophoneActive?: boolean;
  encoderName?: string;
  [k: string]: unknown;
}

export interface SelkiesServerSettings {
  encoder?: { value?: string; allowed?: string[] };
  framerate?: { value?: number; allowed?: number[] };
  video_bitrate?: { value?: number };
  [k: string]: unknown;
}

function postToCore(message: object) {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(message, window.location.origin);
}

const SETTINGS_FIELDS: ReadonlyArray<[keyof HudPrefs, string]> = [
  ['framerate', 'framerate'],
  ['clipboardIn', 'clipboard_in_enabled'],
  ['clipboardOut', 'clipboard_out_enabled'],
  ['h264Crf', 'h264_crf'],
  ['jpegQuality', 'jpeg_quality'],
  ['binaryClipboard', 'enable_binary_clipboard'],
  ['paintOverQuality', 'use_paint_over_quality'],
  ['browserCursors', 'use_browser_cursors'],
  ['scalingDpi', 'scaling_dpi'],
  ['cssScaling', 'use_css_scaling'],
  ['useCpu', 'use_cpu'],
  ['rateControlMode', 'rate_control_mode'],
  ['h264StreamingMode', 'h264_streaming_mode'],
];

function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const k of aKeys) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) {
      return false;
    }
  }

  return true;
}

function resolutionEqual(a: HudPrefs['manualResolution'], b: HudPrefs['manualResolution']): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.width === b.width && a.height === b.height;
}

// Translates the user's HUD prefs into the postMessage envelopes Selkies'
// core consumes. Only sends messages whose underlying fields changed since
// the previous apply — Selkies treats a full `settings` push or a
// `resetResolutionToWindow` as a stream reset (clears decoders, re-pushes
// resolution), so re-sending them on every pref toggle visibly restarts the
// Selkies canvas.
function applyPrefsToSelkies(prefs: HudPrefs, previous: HudPrefs | null) {
  // Consumed by the proxy-injected parent script (proxy.go), not by Selkies' core.
  // The parent intercepts any `hud:*` message before relaying to Selkies.
  if (!previous || previous.keyboardLayout !== prefs.keyboardLayout || !shallowEqual(previous.gamepadLayouts, prefs.gamepadLayouts)) {
    postToCore({ type: 'hud:inputRemap', keyboardLayout: prefs.keyboardLayout, gamepadLayouts: prefs.gamepadLayouts });
  }

  if (!previous || previous.audioEnabled !== prefs.audioEnabled) {
    postToCore({ type: 'pipelineControl', pipeline: 'audio', enabled: prefs.audioEnabled });
  }

  if (!previous || previous.microphoneEnabled !== prefs.microphoneEnabled) {
    postToCore({ type: 'pipelineControl', pipeline: 'microphone', enabled: prefs.microphoneEnabled });
  }

  if (!previous || previous.microphoneDeviceId !== prefs.microphoneDeviceId) {
    postToCore({ type: 'setMicrophoneDevice', deviceId: prefs.microphoneDeviceId });
  }

  if (!previous || previous.gamepadEnabled !== prefs.gamepadEnabled) {
    postToCore({ type: 'pipelineControl', pipeline: 'gamepad', enabled: prefs.gamepadEnabled });
  }

  const settings: Record<string, unknown> = {};
  for (const [prefKey, settingsKey] of SETTINGS_FIELDS) {
    if (!previous || previous[prefKey] !== prefs[prefKey]) {
      settings[settingsKey] = prefs[prefKey];
    }
  }

  const bitrateChanged = !previous || previous.videoBitrate !== prefs.videoBitrate || previous.videoBitrateAuto !== prefs.videoBitrateAuto;
  if (bitrateChanged && !prefs.videoBitrateAuto) {
    settings.video_bitrate = prefs.videoBitrate;
  }

  if (Object.keys(settings).length > 0) {
    postToCore({ type: 'settings', settings });
  }

  if (!previous || !resolutionEqual(previous.manualResolution, prefs.manualResolution)) {
    if (prefs.manualResolution) {
      postToCore({ type: 'setManualResolution', width: prefs.manualResolution.width, height: prefs.manualResolution.height });
    } else {
      postToCore({ type: 'resetResolutionToWindow' });
    }
  }
}

export interface StatsHistory {
  fps: number[];
  latency: number[];
  bandwidth: number[];
  cpu: number[];
  gpu: number[];
}

export interface SelkiesBridge {
  stats: SelkiesStats | null;
  history: StatsHistory;
  serverSettings: SelkiesServerSettings | null;
  ready: boolean;
  applyPrefs: (prefs: HudPrefs) => void;
  setEncoder: (encoder: string) => void;
  restartVideo: () => void;
  showVirtualKeyboard: () => void;
}

interface ParentStatsGlobals {
  fps?: number;
  system_stats?: { cpu_percent?: number; mem_total?: number; mem_used?: number };
  gpu_stats?: { load?: number; memory_total?: number; memory_used?: number };
  network_stats?: { bandwidth_mbps?: number; latency_ms?: number };
}

// Selkies' WS-mode bundle stores stats it receives over WebSocket on the parent
// window globals, but its own getStats postMessage handler reads from closure
// vars that are never updated in WS mode (they only get populated in WebRTC
// mode). Same-origin parent access lets us bypass the broken bridge.
function readParentStats(): Partial<SelkiesStats> {
  if (window.parent === window) {
    return {};
  }

  try {
    const p = window.parent as unknown as ParentStatsGlobals;
    const out: Partial<SelkiesStats> = {};
    if (typeof p.fps === 'number') {
      out.clientFps = p.fps;
    }

    if (p.system_stats) {
      out.cpu = {
        serverCPUUsage: p.system_stats.cpu_percent,
        serverMemoryUsed: p.system_stats.mem_used,
        serverMemoryTotal: p.system_stats.mem_total,
      };
    }

    if (p.gpu_stats) {
      const load = typeof p.gpu_stats.load === 'number' ? p.gpu_stats.load * 100 : undefined;
      out.gpu = {
        gpuLoad: load,
        gpuMemoryUsed: p.gpu_stats.memory_used,
        gpuMemoryTotal: p.gpu_stats.memory_total,
      };
    }

    if (p.network_stats) {
      out.network = {
        latencyMs: p.network_stats.latency_ms,
        bandwidthMbps: p.network_stats.bandwidth_mbps,
      };
    }

    return out;
  } catch {
    return {};
  }
}

const EMPTY_HISTORY: StatsHistory = { fps: [], latency: [], bandwidth: [], cpu: [], gpu: [] };

function push(buf: number[], v: number | null): number[] {
  const next = buf.length >= STATS_HISTORY_LEN ? buf.slice(1) : buf.slice();
  next.push(v == null || Number.isNaN(v) ? 0 : v);
  return next;
}

// Thin live channel to Selkies' core via postMessage. Tracks readiness (the
// first `serverSettings` arrival) and surfaces stats; everything user-facing
// flows through HUD prefs and applyPrefs.
export function useSelkiesBridge(): SelkiesBridge {
  const [stats, setStats] = useState<SelkiesStats | null>(null);
  const [history, setHistory] = useState<StatsHistory>(EMPTY_HISTORY);
  const [serverSettings, setServerSettings] = useState<SelkiesServerSettings | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) {
        return;
      }

      const data = ev.data as { type?: string; data?: unknown; payload?: unknown } | null;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'serverSettings') {
        setReady(true);
        // Selkies sends fields either flat alongside `type`, or nested under `payload`/`data`.
        const payload = (data.payload as SelkiesServerSettings) ?? (data.data as SelkiesServerSettings) ?? (data as unknown as SelkiesServerSettings);
        setServerSettings(payload);
      }

      if (data.type === 'stats') {
        const fromPostMessage = (data.data as SelkiesStats) ?? (data.payload as SelkiesStats) ?? (data as unknown as SelkiesStats);
        const merged: SelkiesStats = { ...fromPostMessage, ...readParentStats() };
        setStats(merged);
        setHistory((h) => ({
          fps: push(h.fps, typeof merged.clientFps === 'number' ? merged.clientFps : null),
          latency: push(h.latency, typeof merged.network?.latencyMs === 'number' ? merged.network.latencyMs : null),
          bandwidth: push(h.bandwidth, typeof merged.network?.bandwidthMbps === 'number' ? merged.network.bandwidthMbps : null),
          cpu: push(h.cpu, typeof merged.cpu?.serverCPUUsage === 'number' ? merged.cpu.serverCPUUsage : null),
          gpu: push(h.gpu, typeof merged.gpu?.gpuLoad === 'number' ? merged.gpu.gpuLoad : null),
        }));
      }
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  // Poll Selkies for stats via its postMessage protocol. The core responds
  // with `{ type: 'stats', data: {...} }` handled above.
  useEffect(() => {
    if (window.parent === window) {
      return;
    }

    // Selkies' WS core only ticks `window.fps` while it believes the sidebar is
    // open. We hide the sidebar UI (SELKIES_UI_SHOW_SIDEBAR=False) but still
    // need the counter, so flip the internal flag without rendering anything.
    postToCore({ type: 'sidebarVisibilityChanged', isOpen: true });

    const tick = () => postToCore({ type: 'getStats' });
    tick();
    const id = window.setInterval(tick, STATS_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const lastAppliedRef = useRef<HudPrefs | null>(null);
  const applyPrefs = useCallback((prefs: HudPrefs) => {
    applyPrefsToSelkies(prefs, lastAppliedRef.current);
    lastAppliedRef.current = prefs;
  }, []);

  const setEncoder = useCallback((encoder: string) => {
    postToCore({ type: 'settings', settings: { encoder } });
  }, []);

  const restartVideo = useCallback(() => {
    postToCore({ type: 'pipelineControl', pipeline: 'video', enabled: false });
    window.setTimeout(() => {
      postToCore({ type: 'pipelineControl', pipeline: 'video', enabled: true });
    }, 200);
  }, []);

  const showVirtualKeyboard = useCallback(() => {
    postToCore({ type: 'showVirtualKeyboard' });
  }, []);

  return useMemo(() => ({ stats, history, serverSettings, ready, applyPrefs, setEncoder, restartVideo, showVirtualKeyboard }), [stats, history, serverSettings, ready, applyPrefs, setEncoder, restartVideo, showVirtualKeyboard]);
}
