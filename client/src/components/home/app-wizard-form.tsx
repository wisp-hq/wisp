import { useForm } from '@tanstack/react-form';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '@/clients/catalog.client';
import { useCatalog } from '@/hooks/use-catalog';
import { tr } from '@/lib/app-spec';
import { resolveSpec } from '@/lib/effective-spec';
import type { AppOverrides, AppRecord, AppSpec } from '@/lib/types';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { type StepItem, Stepper } from '../ui/stepper';
import type { AppWizardValues, WizardMode } from './app-wizard';
import { IDENTITY_DEFAULTS, IdentityStep, type IdentityStepValues } from './identity-step';
import { isValidImageRef } from './image-autocomplete';
import { ContainerStep } from './wizard/container-step';
import { FeaturesStep } from './wizard/features-step';
import { ReviewStep } from './wizard/review-step';
import { StorageStep } from './wizard/storage-step';
import { isRowIncomplete, parseEnv, rowsToVolumes, type VolumeRow, volumesToRows } from './wizard/wizard-shared';

function isCatalogMode(mode: WizardMode): boolean {
  return mode.kind === 'catalog' || (mode.kind === 'edit' && !!mode.app.catalogSource);
}

interface FormValues extends IdentityStepValues {
  envText: string;
  perUserVolumes: VolumeRow[];
  sharedVolumes: VolumeRow[];
  features: Record<string, boolean>;
}

function enabledFeatures(features: Record<string, unknown> | undefined): Record<string, boolean> {
  if (!features) {
    return {};
  }

  return Object.fromEntries(Object.keys(features).map((featureKey) => [featureKey, true]));
}

function findCatalogEntry(mode: WizardMode, catalog: CatalogEntry[]): CatalogEntry | undefined {
  if (mode.kind === 'catalog') {
    return mode.entry;
  }

  if (mode.kind === 'edit') {
    return catalog.find((entry) => entry.slug === mode.app.slug && entry.catalogSource === mode.app.catalogSource);
  }

  return undefined;
}

// Catalog wins for config; app-only keys survive so apps from a removed catalog source remain editable.
function availableFeatures(mode: WizardMode, catalog: CatalogEntry[]): Record<string, unknown> {
  const catalogEntry = findCatalogEntry(mode, catalog);
  const catalogFeats = catalogEntry?.spec.features ?? {};
  const appFeats = mode.kind === 'edit' ? (resolveSpec(mode.app, catalogEntry)?.features ?? {}) : {};
  return { ...appFeats, ...catalogFeats };
}

const emptyFormValues = (): FormValues => ({
  ...IDENTITY_DEFAULTS,
  envText: 'TZ=Europe/Paris',
  perUserVolumes: [],
  sharedVolumes: [],
  features: {},
});

function catalogFormValues(entry: CatalogEntry, locale: string): FormValues {
  const spec = entry.spec;
  return {
    name: tr(spec, spec.name, locale),
    slug: spec.slug,
    description: tr(spec, spec.description, locale),
    iconUrl: entry.iconUrl,
    image: spec.container.image,
    envText: Object.entries(spec.container.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    perUserVolumes: volumesToRows(spec.volumes, 'perUser'),
    sharedVolumes: volumesToRows(spec.volumes, 'shared'),
    features: enabledFeatures(spec.features),
  };
}

function editFormValues(app: AppRecord, catalogEntry: CatalogEntry | undefined, locale: string): FormValues {
  const effective = resolveSpec(app, catalogEntry);
  if (!effective) {
    return emptyFormValues();
  }

  return {
    name: tr(effective, effective.name, locale),
    slug: effective.slug,
    description: tr(effective, effective.description, locale),
    iconUrl: effective.icon,
    image: effective.container.image,
    envText: Object.entries(effective.container.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    perUserVolumes: volumesToRows(effective.volumes, 'perUser'),
    sharedVolumes: volumesToRows(effective.volumes, 'shared'),
    features: enabledFeatures(effective.features),
  };
}

function initialFormValues(mode: WizardMode, catalog: CatalogEntry[], locale: string): FormValues {
  if (mode.kind === 'catalog') {
    return catalogFormValues(mode.entry, locale);
  }

  if (mode.kind === 'edit') {
    return editFormValues(mode.app, findCatalogEntry(mode, catalog), locale);
  }

  return emptyFormValues();
}

function buildOverrides(values: FormValues, available: Record<string, unknown>): AppOverrides {
  const features = Object.fromEntries(Object.entries(available).filter(([featureKey]) => values.features[featureKey]));

  return {
    container: {
      image: values.image.trim(),
      env: parseEnv(values.envText),
    },
    volumes: [...rowsToVolumes(values.perUserVolumes, 'perUser'), ...rowsToVolumes(values.sharedVolumes, 'shared')],
    features: Object.keys(features).length > 0 ? features : undefined,
  };
}

function buildCustomSpec(values: FormValues, available: Record<string, unknown>): AppSpec {
  const features = Object.fromEntries(Object.entries(available).filter(([featureKey]) => values.features[featureKey]));

  return {
    schemaVersion: 1,
    slug: values.slug.trim(),
    version: '1.0.0',
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    icon: values.iconUrl.trim(),
    container: {
      image: values.image.trim(),
      env: parseEnv(values.envText),
    },
    volumes: [...rowsToVolumes(values.perUserVolumes, 'perUser'), ...rowsToVolumes(values.sharedVolumes, 'shared')],
    features: Object.keys(features).length > 0 ? features : undefined,
  };
}

interface Props {
  mode: WizardMode;
  onClose: () => void;
  onSubmit: (values: AppWizardValues) => Promise<void>;
}

export function AppWizardForm({ mode, onClose, onSubmit }: Props) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const dirtyRef = useRef(false);

  const isEdit = mode.kind === 'edit';
  const catalogMode = isCatalogMode(mode);

  const { data: catalog = [] } = useCatalog();
  const baseFeatures = useMemo(() => availableFeatures(mode, catalog), [mode, catalog]);
  const featureKeys = useMemo(() => Object.keys(baseFeatures), [baseFeatures]);
  const hasFeatures = featureKeys.length > 0;

  const steps = useMemo<StepItem[]>(() => {
    const items: StepItem[] = [];
    if (!catalogMode) {
      items.push({ id: 'identity', title: t('wizard.steps.identity') });
    }

    items.push({ id: 'storage', title: t('wizard.steps.storage') });
    items.push({ id: 'container', title: t('wizard.steps.container') });

    if (hasFeatures) {
      items.push({ id: 'features', title: t('wizard.steps.features') });
    }

    items.push({ id: 'review', title: t('wizard.steps.review') });
    return items;
  }, [t, hasFeatures, catalogMode]);

  const currentStepId = steps[step]?.id ?? 'storage';

  const form = useForm({
    defaultValues: initialFormValues(mode, catalog, i18n.language),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const catalogSource = mode.kind === 'catalog' ? mode.entry.catalogSource : mode.kind === 'edit' ? mode.app.catalogSource : '';
        const catalogEntry = findCatalogEntry(mode, catalog);
        const version = mode.kind === 'catalog' ? mode.entry.spec.version : mode.kind === 'edit' ? (catalogEntry?.spec.version ?? mode.app.version) : '1.0.0';
        const spec = catalogMode ? buildOverrides(value, baseFeatures) : buildCustomSpec(value, baseFeatures);
        await onSubmit({
          slug: catalogMode ? (catalogEntry?.slug ?? (mode.kind === 'edit' ? mode.app.slug : '')) : value.slug.trim(),
          catalogSource,
          version,
          spec,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  function handleClose() {
    if (dirtyRef.current && step > 0) {
      setShowDiscard(true);
      return;
    }

    onClose();
  }

  function validateCurrentStep(): boolean {
    if (currentStepId === 'identity') {
      const values = form.state.values;
      if (!values.name.trim()) {
        return false;
      }

      if (!values.image.trim()) {
        return false;
      }

      if (!isValidImageRef(values.image)) {
        return false;
      }

      return true;
    }
    if (currentStepId === 'storage') {
      const values = form.state.values;
      if (values.perUserVolumes.some(isRowIncomplete) || values.sharedVolumes.some(isRowIncomplete)) {
        return false;
      }

      return true;
    }
    if (currentStepId === 'container') {
      try {
        parseEnv(form.state.values.envText);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  function goNext() {
    dirtyRef.current = true;
    if (!validateCurrentStep()) {
      return;
    }

    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  }

  function goPrev() {
    if (step > 0) {
      setStep(step - 1);
    }
  }

  function handleStepClick(index: number) {
    if (index < step) {
      setStep(index);
    } else if (index === step + 1 && validateCurrentStep()) {
      setStep(index);
    }
  }

  const editCatalogEntry = mode.kind === 'edit' ? findCatalogEntry(mode, catalog) : undefined;
  const editEffective = mode.kind === 'edit' ? resolveSpec(mode.app, editCatalogEntry) : null;
  const title = mode.kind === 'edit' ? t('wizard.editTitle', { name: editEffective ? tr(editEffective, editEffective.name, i18n.language) : mode.app.slug }) : mode.kind === 'catalog' ? t('wizard.title', { name: tr(mode.entry.spec, mode.entry.spec.name, i18n.language) }) : t('wizard.titleCustom');

  const description = isEdit ? t('wizard.editDescription') : t('wizard.description');

  const isLastStep = step === steps.length - 1;

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isLastStep) {
            form.handleSubmit();
          } else {
            goNext();
          }
        }}
        className="flex min-h-0 flex-1 flex-col gap-5"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Stepper steps={steps} currentStep={step} onStepClick={handleStepClick} className="px-4" />

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {currentStepId === 'identity' && <IdentityStep form={form as unknown as Parameters<typeof IdentityStep>[0]['form']} isEdit={isEdit} />}
          {currentStepId === 'storage' && <StorageStep form={form as unknown as Parameters<typeof StorageStep>[0]['form']} />}
          {currentStepId === 'container' && <ContainerStep form={form as unknown as Parameters<typeof ContainerStep>[0]['form']} />}
          {currentStepId === 'features' && <FeaturesStep form={form as unknown as Parameters<typeof FeaturesStep>[0]['form']} featureKeys={featureKeys} />}
          {currentStepId === 'review' && <ReviewStep values={form.state.values} sourceFeatures={baseFeatures} />}
        </DialogBody>

        {submitError ? <div className="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive">{submitError}</div> : null}

        <DialogFooter className="shrink-0 max-sm:flex-col sm:justify-between">
          <div className="max-sm:contents">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={goPrev} className="max-sm:w-full">
                {t('wizard.previous')}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2 max-sm:contents">
            <Button type="button" variant="secondary" onClick={handleClose} className="sm:hidden">
              {t('common.cancel')}
            </Button>
            {isLastStep ? (
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                  <Button type="submit" disabled={!canSubmit || isSubmitting} className="max-sm:w-full">
                    {isEdit ? (isSubmitting ? t('wizard.saving') : t('wizard.save')) : isSubmitting ? t('wizard.installing') : t('wizard.install')}
                  </Button>
                )}
              </form.Subscribe>
            ) : (
              <Button type="submit" className="max-sm:w-full">
                {t('wizard.next')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>

      <Dialog open={showDiscard} onOpenChange={setShowDiscard}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('wizard.discardTitle')}</DialogTitle>
            <DialogDescription>{t('wizard.discardDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDiscard(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDiscard(false);
                onClose();
              }}
            >
              {t('wizard.discardConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
