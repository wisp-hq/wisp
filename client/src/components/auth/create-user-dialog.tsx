import { useForm } from '@tanstack/react-form';
import { type PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogActions, EMAIL_RE, FieldError, SubmitErrorBox } from '@/components/atoms/form-utils';
import { ThemePicker } from '@/components/atoms/theme-picker';
import { AvatarEditor } from '@/components/auth/avatar-editor';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useThemePreview } from '@/providers/theme-accent';

interface Props extends PropsWithChildren {
  onSubmit: (values: { email: string; password: string; name: string; theme: string; avatar: File | null }) => Promise<void>;
}

export function CreateUserDialog({ children, onSubmit }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const { setPreview } = useThemePreview();

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      theme: '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await onSubmit({
          email: value.email.trim(),
          password: value.password,
          name: value.name.trim(),
          theme: value.theme,
          avatar: pendingAvatar,
        });
        setPreview(null);
        setOpen(false);
        form.reset();
        setPendingAvatar(null);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPreview(null);
      form.reset();
      setSubmitError(null);
      setPendingAvatar(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-5 max-sm:flex-1"
        >
          <DialogHeader className="items-center text-center">
            <DialogTitle>{t('auth.create.title')}</DialogTitle>
            <form.Subscribe selector={(s) => [s.values.theme, s.values.name, s.values.email] as const}>{([theme, name, email]) => <AvatarEditor user={{ theme, name, email }} pendingFile={pendingAvatar} onPick={setPendingAvatar} className="h-20 w-20" textClassName="text-2xl" />}</form.Subscribe>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-5">
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => (value.trim() ? undefined : t('auth.edit.displayNameRequired')),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{t('auth.edit.displayName')}</Label>
                  <Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={t('auth.create.displayNamePlaceholder')} autoFocus />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => (EMAIL_RE.test(value.trim()) ? undefined : t('auth.edit.emailInvalid')),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{t('auth.edit.email')}</Label>
                  <Input id={field.name} type="email" autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={t('auth.create.emailPlaceholder')} />
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
                    <Label htmlFor={field.name}>{t('auth.create.password')}</Label>
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
                    <Label htmlFor={field.name}>{t('auth.create.confirm')}</Label>
                    <PasswordInput id={field.name} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                    <FieldError field={field} />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="theme">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('auth.edit.theme')}</Label>
                  <ThemePicker value={field.state.value} onChange={field.handleChange} />
                </div>
              )}
            </form.Field>
          </DialogBody>

          <SubmitErrorBox error={submitError} />

          <DialogActions form={form} cancelLabel={t('common.cancel')} submitLabel={t('auth.create.create')} submittingLabel={t('auth.create.creating')} onCancel={() => handleOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
