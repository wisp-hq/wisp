import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function UpdateBadge() {
  const { t } = useTranslation();
  return (
    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
      <Download className="h-3 w-3" /> {t('home.update')}
    </span>
  );
}
