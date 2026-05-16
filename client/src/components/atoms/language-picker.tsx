import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language) as SupportedLanguage;

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('language.label')}>
      {SUPPORTED_LANGUAGES.map((code) => {
        const selected = current === code;
        return (
          <label
            key={code}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm transition',
              'has-[:focus-visible]:border-transparent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring',
              selected ? 'border-foreground/40 bg-muted font-medium' : 'border-border hover:bg-muted/60',
            )}
          >
            <input type="radio" name="language" value={code} checked={selected} onChange={() => i18n.changeLanguage(code)} className="sr-only" />
            <span>{t(`language.${code}` as const)}</span>
          </label>
        );
      })}
    </div>
  );
}
