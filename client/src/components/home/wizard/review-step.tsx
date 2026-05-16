import { Check, ChevronDown, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { ReviewRow } from './review-row';
import { ReviewSection } from './review-section';
import { VolumeReviewList } from './volume-review-list';
import { rowsToVolumes, type VolumeRow } from './wizard-shared';

interface ReviewData {
  name: string;
  slug: string;
  description: string;
  iconUrl: string;
  image: string;
  envText: string;
  perUserVolumes: VolumeRow[];
  sharedVolumes: VolumeRow[];
  features: Record<string, boolean>;
}

interface Props {
  values: ReviewData;
  sourceFeatures: Record<string, unknown>;
  className?: string;
}

export function ReviewStep({ values, sourceFeatures, className }: Props) {
  const { t } = useTranslation();
  const [jsonOpen, setJsonOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const envEntries = values.envText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const env =
    envEntries.length > 0
      ? Object.fromEntries(
          envEntries.map((line) => {
            const eq = line.indexOf('=');
            return [line.slice(0, eq), line.slice(eq + 1)];
          }),
        )
      : undefined;

  const featureEntries = Object.keys(sourceFeatures).map((featureKey) => ({
    key: featureKey,
    enabled: values.features[featureKey] ?? false,
  }));

  const enabledFeatures = Object.fromEntries(Object.entries(sourceFeatures).filter(([featureKey]) => values.features[featureKey]));

  const jsonPayload = {
    schemaVersion: 1,
    slug: values.slug,
    version: '1.0.0',
    name: values.name,
    description: values.description || undefined,
    icon: values.iconUrl || undefined,
    container: {
      image: values.image,
      env,
    },
    volumes: [...rowsToVolumes(values.perUserVolumes, 'perUser'), ...rowsToVolumes(values.sharedVolumes, 'shared')],
    features: Object.keys(enabledFeatures).length > 0 ? enabledFeatures : undefined,
  };

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <ReviewSection title={t('wizard.review.section.identity')}>
        <ReviewRow label={t('wizard.review.name')} value={values.name} />
        <ReviewRow label={t('wizard.review.slug')} value={values.slug} mono />
        <ReviewRow label={t('wizard.review.description')} value={values.description || t('wizard.review.none')} muted={!values.description} />
        <ReviewRow label={t('wizard.review.iconUrl')} value={values.iconUrl || t('wizard.review.none')} mono={!!values.iconUrl} muted={!values.iconUrl} />
      </ReviewSection>

      <ReviewSection title={t('wizard.review.section.container')}>
        <ReviewRow label={t('wizard.review.image')} value={values.image} mono />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('wizard.review.envVars')}</span>
          {envEntries.length > 0 ? <pre className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">{envEntries.join('\n')}</pre> : <span className="text-xs text-muted-foreground/70">{t('wizard.review.noEnvVars')}</span>}
        </div>
      </ReviewSection>

      <ReviewSection title={t('wizard.review.section.storage')}>
        <VolumeReviewList label={t('wizard.review.perUserVolumes')} rows={values.perUserVolumes} emptyLabel={t('wizard.review.noVolumes')} />
        <VolumeReviewList label={t('wizard.review.sharedVolumes')} rows={values.sharedVolumes} emptyLabel={t('wizard.review.noVolumes')} />
      </ReviewSection>

      <ReviewSection title={t('wizard.review.section.features')}>
        {featureEntries.length > 0 ? (
          featureEntries.map(({ key, enabled }) => (
            <ReviewRow
              key={key}
              label={t(`wizard.features.${key}.title`, { defaultValue: key })}
              value={enabled ? t('wizard.review.featureOn') : t('wizard.review.featureOff')}
              muted={!enabled}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">{t('wizard.review.noFeatures')}</span>
        )}
      </ReviewSection>

      <div className="rounded-md border border-input/60">
        <div className="flex w-full items-center px-3 py-2 text-sm text-muted-foreground">
          <button type="button" onClick={() => setJsonOpen(!jsonOpen)} className="flex flex-1 items-center gap-2 hover:text-foreground">
            <ChevronDown className={cn('h-4 w-4 transition', !jsonOpen && '-rotate-90')} />
            {t('wizard.review.jsonPreview')}
          </button>
          {jsonOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(jsonPayload, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="h-7 gap-1 text-xs"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? t('wizard.review.jsonCopied') : t('wizard.review.jsonCopy')}
            </Button>
          ) : null}
        </div>
        {jsonOpen ? <pre className="overflow-x-auto border-t border-input/60 px-3 py-2 font-mono text-xs">{JSON.stringify(jsonPayload, null, 2)}</pre> : null}
      </div>
    </div>
  );
}
