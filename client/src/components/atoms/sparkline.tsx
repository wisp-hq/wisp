import { useMemo } from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  className?: string;
}

export function Sparkline({ values, width = 120, height = 28, min, max, className }: Props) {
  const path = useMemo(() => buildPath(values, width, height, min, max), [values, width, height, min, max]);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <title>Trend</title>
      {path.area ? <path d={path.area} fill="currentColor" fillOpacity="0.12" /> : null}
      {path.line ? <path d={path.line} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

function buildPath(values: number[], w: number, h: number, minOverride?: number, maxOverride?: number): { line: string | null; area: string | null } {
  if (values.length === 0) {
    return { line: null, area: null };
  }

  const lo = minOverride ?? Math.min(...values);
  const hi = maxOverride ?? Math.max(...values);
  const range = hi - lo || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pad = 2;
  const drawH = h - pad * 2;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = pad + drawH - ((v - lo) / range) * drawH;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = points.length > 1 ? `${line} L${(points[points.length - 1][0]).toFixed(2)} ${h} L0 ${h} Z` : null;
  return { line, area };
}
