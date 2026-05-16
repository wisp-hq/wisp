import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrorState {
  state: { meta: { errors: unknown[]; isTouched: boolean } };
}

export function FieldError({ field }: { field: FieldErrorState }) {
  if (!field.state.meta.isTouched || field.state.meta.errors.length === 0) {
    return null;
  }

  return <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>;
}

export function SubmitErrorBox({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }

  return <div className="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive">{error}</div>;
}

type SubmitState = { canSubmit: boolean; isSubmitting: boolean };
type SubmitPair = readonly [boolean, boolean];

interface FormSubscribe {
  Subscribe: (props: { selector: (state: SubmitState) => SubmitPair; children: (state: SubmitPair) => ReactNode }) => ReactNode | Promise<ReactNode>;
}

interface DialogActionsProps {
  form: FormSubscribe;
  cancelLabel: string;
  submitLabel: string;
  submittingLabel: string;
  onCancel: () => void;
}

export function DialogActions({ form, cancelLabel, submitLabel, submittingLabel, onCancel }: DialogActionsProps) {
  return (
    <DialogFooter>
      <Button type="button" variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? submittingLabel : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </DialogFooter>
  );
}
