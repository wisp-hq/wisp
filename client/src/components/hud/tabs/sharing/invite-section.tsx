import { Check, Copy, Eye, EyeOff, Link, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InviteResponse } from '@/clients/invites.client';
import { IconAction } from './icon-action';

interface Props {
  invite: InviteResponse | null;
  loading: boolean;
  onRotate: () => void;
  rotating: boolean;
}

export function InviteSection({ invite, loading, onRotate, rotating }: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const fullUrl = invite ? window.parent.location.origin + invite.path : '';

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function copy() {
    if (!fullUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 py-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Link className="h-3 w-3" />
        <span>{t('hud.overlay.sharing.inviteLinkHeader')}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate rounded bg-muted/30 px-2 py-1.5 font-mono text-[11px]">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : revealed ? fullUrl || '—' : <span className="select-none text-muted-foreground tracking-[0.2em]">••••••••••••••••</span>}</div>
        <IconAction onClick={() => setRevealed((current) => !current)} title={revealed ? t('hud.overlay.sharing.hideLink') : t('hud.overlay.sharing.revealLink')} disabled={!invite}>
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </IconAction>
        <IconAction onClick={copy} title={copied ? t('hud.overlay.sharing.copied') : t('hud.overlay.sharing.copyLink')} disabled={!fullUrl}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </IconAction>
        <IconAction onClick={onRotate} title={t('hud.overlay.sharing.rotateLink')} disabled={rotating || !invite}>
          {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </IconAction>
      </div>
      <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">{t('hud.overlay.sharing.inviteLinkHint')}</p>
    </div>
  );
}
