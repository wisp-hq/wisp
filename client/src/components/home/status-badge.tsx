import { useTranslation } from 'react-i18next';
import type { SessionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<SessionStatus, string> = {
  starting: 'bg-amber-500/20 text-amber-300',
  ready: 'bg-emerald-500/20 text-emerald-300',
  stopping: 'bg-slate-500/30 text-slate-300',
  stopped: 'bg-slate-500/30 text-slate-300',
  failed: 'bg-red-500/20 text-red-300',
};

interface Props {
  status: SessionStatus;
}

export function StatusBadge({ status }: Props) {
  const { t } = useTranslation();
  return <span className={cn('absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', STATUS_CLASS[status])}>{t(`home.status.${status}` as const)}</span>;
}
