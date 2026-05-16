import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogActions, FieldError, SubmitErrorBox } from '@/components/atoms/form-utils';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { pb } from '@/lib/pb';
import type { UserRecord } from '@/lib/types';
import { useUser } from '@/providers/auth-provider';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const user = useUser();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      oldPassword: '',
      password: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const body = new FormData();
        body.set('oldPassword', value.oldPassword);
        body.set('password', value.password);
        body.set('passwordConfirm', value.password);
        const updated = await pb.collection<UserRecord>('users').update(user.id, body);
        pb.authStore.save(pb.authStore.token, updated);
        onOpenChange(false);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSubmitError(null);
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-5 max-sm:flex-1"
        >
          <DialogHeader>
            <DialogTitle>{t('auth.changePassword.title')}</DialogTitle>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-5">
            <form.Field
              name="oldPassword"
              validators={{
                onChange: ({ value }) => (value ? undefined : t('auth.changePassword.currentRequired')),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{t('auth.changePassword.current')}</Label>
                  <PasswordInput id={field.name} autoComplete="current-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="password"
                validators={{
                  onChange: ({ value }) => (value.length >= 8 ? undefined : t('auth.create.passwordTooShort')),
                }}
              >
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={field.name}>{t('auth.changePassword.newPassword')}</Label>
                    <PasswordInput id={field.name} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                    <FieldError field={field} />
                  </div>
                )}
              </form.Field>

              <form.Field
                name="confirmPassword"
                validators={{
                  onChangeListenTo: ['password'],
                  onChange: ({ value, fieldApi }) => (value === fieldApi.form.getFieldValue('password') ? undefined : t('auth.create.passwordsDontMatch')),
                }}
              >
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={field.name}>{t('auth.changePassword.confirm')}</Label>
                    <PasswordInput id={field.name} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                    <FieldError field={field} />
                  </div>
                )}
              </form.Field>
            </div>
          </DialogBody>

          <SubmitErrorBox error={submitError} />

          <DialogActions form={form} cancelLabel={t('common.cancel')} submitLabel={t('auth.changePassword.update')} submittingLabel={t('common.saving')} onCancel={() => handleOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
