import type { AnyFieldApi } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ImageAutocomplete, isValidImageRef } from './image-autocomplete';
import { WizardField } from './wizard/wizard-field';

export interface IdentityStepValues {
  name: string;
  slug: string;
  description: string;
  iconUrl: string;
  image: string;
}

export const IDENTITY_DEFAULTS: IdentityStepValues = {
  name: '',
  slug: '',
  description: '',
  iconUrl: '',
  image: '',
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const ICON_URL_RE = /^https?:\/\/.+/;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

interface Props {
  form: {
    Field: (props: { name: keyof IdentityStepValues; validators?: { onChange?: (opts: { value: string }) => string | undefined }; children: (field: AnyFieldApi) => React.ReactNode }) => React.ReactNode;
    setFieldValue: (name: keyof IdentityStepValues, value: string) => void;
    getFieldValue: (name: keyof IdentityStepValues) => string;
  };
  isEdit?: boolean;
  className?: string;
}

export function IdentityStep({ form, isEdit = false, className }: Props) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => {
              if (!value.trim()) {
                return t('identityStep.errors.nameRequired');
              }

              if (!isEdit && !SLUG_RE.test(slugify(value))) {
                return t('identityStep.errors.nameInvalid');
              }

              return undefined;
            },
          }}
        >
          {(field: AnyFieldApi) => (
            <WizardField label={t('identityStep.name')} field={field}>
              <Input
                id={field.name}
                value={field.state.value as string}
                onChange={(event) => {
                  const next = event.target.value;
                  field.handleChange(next);
                  if (!isEdit) {
                    form.setFieldValue('slug', slugify(next));
                  }
                }}
                placeholder={t('identityStep.namePlaceholder')}
              />
            </WizardField>
          )}
        </form.Field>

        <form.Field name="slug">
          {(field: AnyFieldApi) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t('identityStep.slug')}</Label>
              <Input id={field.name} value={field.state.value as string} readOnly tabIndex={-1} aria-readonly placeholder="my-app" className="font-mono text-sm text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t('identityStep.slugHint')}</p>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="description">
        {(field: AnyFieldApi) => (
          <WizardField label={t('identityStep.description')} field={field} hint={t('identityStep.descriptionHint')}>
            <Textarea id={field.name} value={field.state.value as string} onChange={(event) => field.handleChange(event.target.value)} placeholder={t('identityStep.descriptionPlaceholder')} rows={3} />
          </WizardField>
        )}
      </form.Field>

      <form.Field
        name="iconUrl"
        validators={{
          onChange: ({ value }) => {
            if (!value.trim()) {
              return undefined;
            }

            if (!ICON_URL_RE.test(value.trim())) {
              return t('identityStep.errors.iconUrlInvalid');
            }

            return undefined;
          },
        }}
      >
        {(field: AnyFieldApi) => (
          <WizardField label={t('identityStep.iconUrl')} field={field} hint={t('identityStep.iconUrlHint')}>
            <div className="flex items-center gap-3">
              <Input id={field.name} value={field.state.value as string} onChange={(event) => field.handleChange(event.target.value)} placeholder="https://example.com/icon.png" className="flex-1" />
              {(field.state.value as string).trim() && ICON_URL_RE.test((field.state.value as string).trim()) ? (
                <img
                  src={field.state.value as string}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg border border-input object-contain"
                  onError={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  onLoad={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = '';
                  }}
                />
              ) : null}
            </div>
          </WizardField>
        )}
      </form.Field>

      <form.Field
        name="image"
        validators={{
          onChange: ({ value }) => {
            if (!value.trim()) {
              return t('identityStep.errors.imageRequired');
            }

            if (!isValidImageRef(value)) {
              return t('identityStep.errors.imageInvalid');
            }

            return undefined;
          },
        }}
      >
        {(field: AnyFieldApi) => (
          <WizardField label={t('identityStep.image')} field={field} hint={t('identityStep.imageHint')}>
            <ImageAutocomplete id={field.name} value={field.state.value as string} onChange={(next) => field.handleChange(next)} placeholder="ghcr.io/owner/image:tag" className="font-mono text-sm" showFormatHint />
          </WizardField>
        )}
      </form.Field>
    </div>
  );
}
