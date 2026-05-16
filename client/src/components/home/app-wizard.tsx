import type { CatalogEntry } from '@/clients/catalog.client';
import type { AppOverrides, AppRecord, AppSpec } from '@/lib/types';
import { Dialog, DialogContent } from '../ui/dialog';
import { AppWizardForm } from './app-wizard-form';

export interface AppWizardValues {
  slug: string;
  catalogSource: string;
  version: string;
  spec: AppOverrides | AppSpec;
}

export type WizardMode = { kind: 'catalog'; entry: CatalogEntry } | { kind: 'custom' } | { kind: 'edit'; app: AppRecord };

export type AppWizardTarget = WizardMode | null;

interface Props {
  target: AppWizardTarget;
  onClose: () => void;
  onSubmit: (values: AppWizardValues) => Promise<void>;
}

function targetKey(target: WizardMode): string {
  if (target.kind === 'catalog') {
    return `catalog-${target.entry.slug}`;
  }

  if (target.kind === 'edit') {
    return `edit-${target.app.id}`;
  }

  return 'custom';
}

export function AppWizard({ target, onClose, onSubmit }: Props) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:h-[85vh] sm:max-w-3xl sm:overflow-hidden lg:max-w-4xl xl:max-w-5xl">{target ? <AppWizardForm key={targetKey(target)} mode={target} onClose={onClose} onSubmit={onSubmit} /> : null}</DialogContent>
    </Dialog>
  );
}
