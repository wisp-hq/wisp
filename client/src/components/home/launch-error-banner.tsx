import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchError } from '@/hooks/use-launch-session';

interface Props {
  error: LaunchError;
  onDismiss: () => void;
}

export function LaunchErrorBanner({ error, onDismiss }: Props) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="mx-auto mt-4 max-w-5xl rounded-md bg-destructive/20 px-4 py-2 text-sm text-destructive">
      <div className="flex items-start justify-between gap-3">
        <span className="break-words">{error.title}</span>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          {error.details ? (
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="underline">
              {showDetails ? t('home.errors.hideDetails') : t('home.errors.showDetails')}
            </button>
          ) : null}
          <button type="button" onClick={onDismiss} className="underline">
            {t('common.dismiss')}
          </button>
        </div>
      </div>
      {showDetails && error.details ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 text-xs">{error.details}</pre> : null}
    </div>
  );
}
