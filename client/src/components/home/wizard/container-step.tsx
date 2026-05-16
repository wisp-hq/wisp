import type { AnyFieldApi } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Textarea } from '../../ui/textarea';
import { WizardField } from './wizard-field';
import { parseEnv } from './wizard-shared';

interface ContainerStepForm {
  Field: (props: { name: 'envText'; validators?: { onChange?: (opts: { value: string }) => string | undefined }; children: (field: AnyFieldApi) => React.ReactNode }) => React.ReactNode;
}

interface Props {
  form: ContainerStepForm;
  className?: string;
}

export function ContainerStep({ form, className }: Props) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <form.Field
        name="envText"
        validators={{
          onChange: ({ value }) => {
            try {
              parseEnv(value);
              return undefined;
            } catch (err) {
              return err instanceof Error ? err.message : String(err);
            }
          },
        }}
      >
        {(field: AnyFieldApi) => (
          <WizardField label={t('wizard.container.envVars')} field={field} hint={t('wizard.container.envHint')}>
            <Textarea id={field.name} value={field.state.value as string} onChange={(event) => field.handleChange(event.target.value)} rows={6} className="font-mono text-sm" placeholder="KEY=VALUE" />
          </WizardField>
        )}
      </form.Field>
    </div>
  );
}
