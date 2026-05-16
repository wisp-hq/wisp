import { Activity, Cpu, Gauge, Wifi, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelkiesBridge } from '@/lib/selkies-bridge';
import { cn } from '@/lib/utils';
import { StatCard } from './stat-card';

interface Props {
  bridge: SelkiesBridge;
}

const PERIODS = { '1m': 60, '5m': 300, '15m': 900 } as const;
type Period = keyof typeof PERIODS;

export function StatsPanel({ bridge }: Props) {
  const { t } = useTranslation();
  const { stats, history } = bridge;
  const [period, setPeriod] = useState<Period>('1m');

  if (!stats) {
    return (
      <div className="flex items-center justify-center gap-2 px-2 py-1 text-center text-xs text-muted-foreground md:h-full md:flex-col md:rounded-lg md:border md:bg-muted/20 md:px-3 md:py-6">
        <Activity className="h-4 w-4 animate-pulse md:mb-2" />
        <span>{t('hud.overlay.general.statsLoading')}</span>
      </div>
    );
  }

  const fps = typeof stats.clientFps === 'number' ? Math.round(stats.clientFps) : null;
  const cpu = typeof stats.cpu?.serverCPUUsage === 'number' ? Math.round(stats.cpu.serverCPUUsage) : null;
  const gpu = typeof stats.gpu?.gpuLoad === 'number' ? Math.round(stats.gpu.gpuLoad) : null;
  const latency = typeof stats.network?.latencyMs === 'number' ? Math.round(stats.network.latencyMs) : null;
  const bandwidth = typeof stats.network?.bandwidthMbps === 'number' ? stats.network.bandwidthMbps : null;

  const sliceCount = PERIODS[period];
  const slice = (values: number[]) => (values.length > sliceCount ? values.slice(-sliceCount) : values);

  return (
    <div className="flex items-stretch gap-2 md:h-full md:flex-col">
      <div className="hidden items-center justify-between gap-2 md:flex">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('hud.overlay.general.stats')}</span>
        <div className="flex gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {(Object.keys(PERIODS) as Period[]).map((periodKey) => (
            <button key={periodKey} type="button" onClick={() => setPeriod(periodKey)} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition', periodKey === period ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {periodKey}
            </button>
          ))}
        </div>
      </div>
      <StatCard icon={<Zap className="h-3.5 w-3.5" />} label={t('hud.overlay.general.statFps')} value={fps !== null ? `${fps}` : '—'} values={slice(history.fps)} accent="text-emerald-500" />
      <StatCard icon={<Gauge className="h-3.5 w-3.5" />} label={t('hud.overlay.general.statLatency')} value={latency !== null ? `${latency} ms` : '—'} values={slice(history.latency)} accent={latencyAccent(latency)} />
      <StatCard icon={<Wifi className="h-3.5 w-3.5" />} label={t('hud.overlay.general.statBandwidth')} value={bandwidth !== null ? `${bandwidth.toFixed(1)} Mbps` : '—'} values={slice(history.bandwidth)} accent="text-cyan-400" />
      <StatCard icon={<Cpu className="h-3.5 w-3.5" />} label={t('hud.overlay.general.statCpu')} value={cpu !== null ? `${cpu}%` : '—'} values={slice(history.cpu)} min={0} max={100} accent="text-sky-400" />
      <StatCard icon={<Activity className="h-3.5 w-3.5" />} label={t('hud.overlay.general.statGpu')} value={gpu !== null ? `${gpu}%` : '—'} values={slice(history.gpu)} min={0} max={100} accent="text-violet-400" />
    </div>
  );
}

function latencyAccent(latency: number | null): string {
  if (latency === null) {
    return 'text-muted-foreground';
  }

  if (latency >= 100) {
    return 'text-red-500';
  }

  if (latency >= 50) {
    return 'text-amber-400';
  }

  return 'text-emerald-500';
}
