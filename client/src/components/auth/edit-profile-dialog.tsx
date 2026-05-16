import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogActions, EMAIL_RE, FieldError, SubmitErrorBox } from '@/components/atoms/form-utils';
import { LanguagePicker } from '@/components/atoms/language-picker';
import { RegionPicker } from '@/components/atoms/region-picker';
import { ThemePicker } from '@/components/atoms/theme-picker';
import { AvatarEditor } from '@/components/auth/avatar-editor';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { avatarUrl, pb } from '@/lib/pb';
import { DEFAULT_REGION, type Region, type UserRecord } from '@/lib/types';
import { useUser } from '@/providers/auth-provider';
import { useThemePreview } from '@/providers/theme-accent';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const user = useUser();
  const { setPreview } = useThemePreview();
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: user.name ?? '',
      email: user.email ?? '',
      theme: user.theme ?? '',
      region: (user.region || DEFAULT_REGION) as Region,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const body = new FormData();
        body.set('name', value.name.trim());
        body.set('email', value.email.trim());
        body.set('theme', value.theme);
        body.set('region', value.region);
        if (pendingAvatar) {
          body.set('avatar', pendingAvatar);
        }

        const updated = await pb.collection<UserRecord>('users').update(user.id, body);
        pb.authStore.save(pb.authStore.token, updated);
        setPreview(null);
        setPendingAvatar(null);
        onOpenChange(false);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setPreview(null);
      setPendingAvatar(null);
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
          className="flex flex-col gap-5 max-sm:min-h-0 max-sm:flex-1"
        >
          <DialogHeader className="items-center text-center">
            <DialogTitle>{t('auth.edit.title')}</DialogTitle>
            <form.Subscribe selector={(s) => [s.values.theme, s.values.name, s.values.email] as const}>
              {([theme, name, email]) => <AvatarEditor user={{ theme, name, email, avatarUrl: user.avatar ? avatarUrl(user) : null }} pendingFile={pendingAvatar} onPick={setPendingAvatar} className="h-20 w-20" textClassName="text-2xl" />}
            </form.Subscribe>
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
                  <Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
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
                  <Input id={field.name} type="email" autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <form.Field name="theme">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('auth.edit.theme')}</Label>
                  <ThemePicker value={field.state.value} onChange={field.handleChange} />
                  <p className="text-xs text-muted-foreground">{t('auth.edit.themeHint')}</p>
                </div>
              )}
            </form.Field>

            <form.Field name="region">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('auth.edit.region')}</Label>
                  <RegionPicker value={field.state.value} onChange={field.handleChange} />
                  <p className="text-xs text-muted-foreground">{t('auth.edit.regionHint')}</p>
                </div>
              )}
            </form.Field>

            <div className="flex flex-col gap-2">
              <Label>{t('language.label')}</Label>
              <LanguagePicker />
            </div>
          </DialogBody>

          <SubmitErrorBox error={submitError} />

          <DialogActions form={form} cancelLabel={t('common.cancel')} submitLabel={t('auth.edit.saveChanges')} submittingLabel={t('common.saving')} onCancel={() => handleOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
