import type { AppSpec } from './types';

const T_PREFIX = 't:';

export function tr(spec: AppSpec, value: string | undefined, locale: string): string {
  if (!value) {
    return '';
  }

  if (!value.startsWith(T_PREFIX)) {
    return value;
  }

  const key = value.slice(T_PREFIX.length);
  const i18n = spec.i18n ?? {};
  return i18n[locale]?.[key] ?? i18n[spec.defaultLocale ?? 'en']?.[key] ?? i18n.en?.[key] ?? key;
}

export function appIconUrl(catalogSource: string, catalogPath: string, icon: string): string {
  if (!icon) {
    return '';
  }

  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:') || icon.startsWith('/')) {
    return icon;
  }

  if (!catalogSource || !catalogPath) {
    return '';
  }

  return `${catalogSource}/${catalogPath}/${icon}`;
}
