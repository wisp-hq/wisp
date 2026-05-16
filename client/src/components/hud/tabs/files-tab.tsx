import { ExternalLink, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SelkiesBridge } from '@/lib/selkies-bridge';

interface Props {
  sessionId?: string;
  bridge?: SelkiesBridge;
}

interface UploadState {
  fileName: string;
  status: 'start' | 'progress' | 'end' | 'error';
  progress?: number;
  message?: string;
}

interface FileUploadMessage {
  type: 'fileUpload';
  payload?: {
    status?: 'start' | 'progress' | 'end' | 'error';
    fileName?: string;
    progress?: number;
    message?: string;
  };
}

function isFileUploadMessage(data: unknown): data is FileUploadMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'fileUpload';
}

function triggerUpload() {
  if (window.parent === window) {
    return;
  }
  window.parent.postMessage({ type: 'hud:requestFileUpload' }, window.location.origin);
}

export function FilesTab({ sessionId, bridge }: Props) {
  const { t } = useTranslation();
  const [upload, setUpload] = useState<UploadState | null>(null);
  const ready = bridge?.ready ?? false;

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) {
        return;
      }
      if (!isFileUploadMessage(ev.data)) {
        return;
      }
      const payload = ev.data.payload;
      if (!payload?.status) {
        return;
      }
      setUpload({
        fileName: payload.fileName ?? '',
        status: payload.status,
        progress: payload.progress,
        message: payload.message,
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!upload || (upload.status !== 'end' && upload.status !== 'error')) {
      return;
    }
    const id = window.setTimeout(() => setUpload(null), 4000);
    return () => window.clearTimeout(id);
  }, [upload]);

  const browseUrl = sessionId ? `/s/${sessionId}/files/` : null;

  function progressLabel(state: UploadState): string {
    if (state.status === 'end') {
      return t('hud.overlay.files.done');
    }
    if (state.status === 'error') {
      return t('hud.overlay.files.error');
    }
    if (typeof state.progress === 'number') {
      return `${Math.round(state.progress)}%`;
    }
    return t('hud.overlay.files.uploading');
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-4 rounded-md px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('hud.overlay.files.upload')}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{ready ? t('hud.overlay.files.uploadDescription') : t('hud.overlay.files.notReady')}</div>
        </div>
        <Button size="sm" variant="outline" onClick={triggerUpload} disabled={!ready} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          {t('hud.overlay.files.uploadButton')}
        </Button>
      </div>
      {upload ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-sm font-medium" title={upload.fileName}>
              {upload.fileName || t('hud.overlay.files.untitled')}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{progressLabel(upload)}</span>
          </div>
          {upload.status === 'error' && upload.message ? <p className="text-xs text-destructive">{upload.message}</p> : <Progress value={progressPercent(upload)} />}
        </div>
      ) : null}
      {browseUrl ? (
        <div className="flex items-center gap-4 rounded-md px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t('hud.overlay.files.browse')}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('hud.overlay.files.browseDescription')}</div>
          </div>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <a href={browseUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              {t('hud.overlay.files.browseButton')}
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function progressPercent(upload: UploadState): number {
  if (upload.status === 'end') {
    return 100;
  }
  if (typeof upload.progress === 'number') {
    return Math.max(0, Math.min(100, upload.progress));
  }
  return 0;
}
