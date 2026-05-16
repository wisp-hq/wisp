import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ALL_CATEGORIES = '__all__';

interface Props {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  className?: string;
}

export function CategoryFilter({ categories, selected, onSelect, className }: Props) {
  const { t } = useTranslation();
  if (categories.length === 0) {
    return null;
  }

  const labelFor = (category: string) => (category === ALL_CATEGORIES ? t('home.categories.all') : t(`home.categories.${category}`, { defaultValue: category }));

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="radiogroup" aria-label={t('home.categories.filterLabel')}>
      {[ALL_CATEGORIES, ...categories].map((category) => {
        const active = category === selected;
        return (
          <Button
            key={category}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(category)}
            className="h-8 rounded-full px-3 text-xs capitalize"
          >
            {labelFor(category)}
          </Button>
        );
      })}
    </div>
  );
}
