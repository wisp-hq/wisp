import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Plus, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  onOpen: () => void;
}

export function CustomInstallTile({ onOpen }: Props) {
  const { t } = useTranslation();
  const { ref: focusRef, focused } = useFocusable<HTMLButtonElement>({ focusKey: 'catalog-custom' });

  return (
    <button
      ref={focusRef}
      type="button"
      data-focused={focused || undefined}
      onClick={onOpen}
      className={cn(
        'group flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/15 bg-transparent p-2 text-muted-foreground transition',
        'sm:gap-3 sm:rounded-xl sm:p-6',
        'hover:scale-[1.02] hover:border-white/40 hover:text-foreground focus-visible:scale-[1.02] focus-visible:border-white/60 focus-visible:outline-none',
        'data-[focused=true]:scale-[1.02] data-[focused=true]:border-ring data-[focused=true]:text-foreground data-[focused=true]:outline-none',
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-white/20 opacity-60 transition group-hover:opacity-100 sm:h-20 sm:w-20">
        <Wrench className="h-5 w-5 sm:h-8 sm:w-8" />
      </div>
      <div className="text-center">
        <div className="line-clamp-1 text-xs font-medium leading-tight sm:text-base">{t('customInstall.tileLabel')}</div>
        <div className="mt-1 hidden items-center gap-1 text-xs sm:inline-flex">
          <Plus className="h-3 w-3" /> {t('home.install')}
        </div>
      </div>
    </button>
  );
}
