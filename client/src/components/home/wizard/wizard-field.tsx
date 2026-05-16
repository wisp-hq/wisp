import { Label } from '../../ui/label';

export interface FieldShape {
  name: string;
  state: { meta: { errors: unknown[]; isTouched: boolean } };
}

export function firstError(errors: unknown[]): string | null {
  for (const error of errors) {
    if (typeof error === 'string' && error) {
      return error;
    }
  }
  return null;
}

interface Props {
  label: string;
  field: FieldShape;
  hint?: string;
  children: React.ReactNode;
}

export function WizardField({ label, field, hint, children }: Props) {
  const error = field.state.meta.isTouched ? firstError(field.state.meta.errors) : null;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name} className={error ? 'text-destructive' : undefined}>
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
