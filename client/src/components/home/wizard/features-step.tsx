import type { AnyFieldApi } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';

interface FeaturesStepForm {
  Field: (props: { name: 'features'; children: (field: AnyFieldApi) => React.ReactNode }) => React.ReactNode;
}

interface Props {
  form: FeaturesStepForm;
  featureKeys: string[];
  className?: string;
}

export function FeaturesStep({ form, featureKeys, className }: Props) {
  const { t } = useTranslation();

  if (featureKeys.length === 0) {
    return (
      <div className={cn('flex flex-col gap-5', className)}>
        <p className="text-sm text-muted-foreground">{t('wizard.features.empty')}</p>
      </div>
    );
  }

  return (
    <form.Field name="features">
      {(field: AnyFieldApi) => {
        const value = field.state.value as Record<string, boolean>;
        return (
          <div className={cn('flex flex-col gap-3', className)}>
            {featureKeys.map((featureKey) => {
              const enabled = value[featureKey] ?? false;
              const title = t(`wizard.features.${featureKey}.title`, { defaultValue: featureKey });
              const description = t(`wizard.features.${featureKey}.description`, { defaultValue: '' });
              const inputId = `feature-${featureKey}`;
              return (
                <div key={featureKey} className="flex items-start justify-between gap-4 rounded-md border border-input/60 p-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={inputId} className="text-sm font-medium">
                      {title}
                    </Label>
                    {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
                  </div>
                  <Switch id={inputId} checked={enabled} onCheckedChange={(checked) => field.handleChange({ ...value, [featureKey]: checked })} />
                </div>
              );
            })}
          </div>
        );
      }}
    </form.Field>
  );
}
