import { Search } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props extends PropsWithChildren {
  search: string;
  setSearch: (value: string) => void;
  className?: string;
}

export function HeaderTools({ search, setSearch, className, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex w-full items-center gap-2 sm:w-auto', className)}>
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('home.searchPlaceholder')} className="pl-9" />
      </div>
      {children}
    </div>
  );
}
