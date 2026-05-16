import type { AnyFieldApi } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { VolumeSection } from './volume-section';
import { isRowIncomplete, newVolumeRow, type VolumeRow } from './wizard-shared';

type VolumeFieldName = 'perUserVolumes' | 'sharedVolumes';

interface StorageStepForm {
  Field: (props: { name: VolumeFieldName; validators?: { onChange?: (opts: { value: VolumeRow[] }) => string | undefined }; children: (field: AnyFieldApi) => React.ReactNode }) => React.ReactNode;
}

interface Props {
  form: StorageStepForm;
  className?: string;
}

export function StorageStep({ form, className }: Props) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <form.Field
        name="perUserVolumes"
        validators={{
          onChange: ({ value }: { value: VolumeRow[] }) => (value.some(isRowIncomplete) ? 'incomplete' : undefined),
        }}
      >
        {(field: AnyFieldApi) => (
          <VolumeSection
            title={t('wizard.storage.perUserSection')}
            hint={t('wizard.storage.hintPerUser')}
            hostPlaceholder={t('wizard.storage.hostPlaceholderPerUser')}
            rows={field.state.value as VolumeRow[]}
            onAdd={() => field.pushValue(newVolumeRow('rw'))}
            onRemove={(index) => field.removeValue(index)}
            onPatch={(index, patch) => field.replaceValue(index, { ...(field.state.value as VolumeRow[])[index], ...patch })}
            addLabel={t('wizard.storage.addVolume')}
            removeLabel={t('wizard.storage.removeVolume')}
            emptyLabel={t('wizard.storage.noVolumesPerUser')}
            rowIncompleteLabel={t('wizard.storage.errors.volumeIncomplete')}
          />
        )}
      </form.Field>

      <form.Field
        name="sharedVolumes"
        validators={{
          onChange: ({ value }: { value: VolumeRow[] }) => (value.some(isRowIncomplete) ? 'incomplete' : undefined),
        }}
      >
        {(field: AnyFieldApi) => (
          <VolumeSection
            title={t('wizard.storage.sharedSection')}
            hint={t('wizard.storage.hintShared')}
            hostPlaceholder={t('wizard.storage.hostPlaceholderShared')}
            rows={field.state.value as VolumeRow[]}
            onAdd={() => field.pushValue(newVolumeRow('ro'))}
            onRemove={(index) => field.removeValue(index)}
            onPatch={(index, patch) => field.replaceValue(index, { ...(field.state.value as VolumeRow[])[index], ...patch })}
            addLabel={t('wizard.storage.addVolume')}
            removeLabel={t('wizard.storage.removeVolume')}
            emptyLabel={t('wizard.storage.noVolumesShared')}
            rowIncompleteLabel={t('wizard.storage.errors.volumeIncomplete')}
          />
        )}
      </form.Field>
    </div>
  );
}
