import { useEffect, useState } from 'react';
import { THEMES } from '@/lib/themes';
import { useThemePreview } from '@/providers/theme-accent';
import { ThemeChip } from './theme-chip';

const CLASSIC_DARK = {
  bg: 'oklch(0.205 0 0)',
  fg: 'oklch(0.985 0 0)',
  accent: 'oklch(0.922 0 0)',
  border: 'oklch(1 0 0 / 20%)',
};

const CLASSIC_LIGHT = {
  bg: 'oklch(1 0 0)',
  fg: 'oklch(0.145 0 0)',
  accent: 'oklch(0.205 0 0)',
  border: 'oklch(0.922 0 0)',
};

function useIsDark() {
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export function ThemePicker({ value, onChange }: Props) {
  const { setPreview } = useThemePreview();
  const isDark = useIsDark();
  const classic = isDark ? CLASSIC_DARK : CLASSIC_LIGHT;
  const pick = (key: string) => {
    onChange(key);
    setPreview(key);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ThemeChip selected={value === ''} onPick={() => pick('')} name="Classic" bg={classic.bg} fg={classic.fg} accent={classic.accent} border={classic.border} />
      {THEMES.map((theme) => (
        <ThemeChip key={theme.key} selected={value === theme.key} onPick={() => pick(theme.key)} name={theme.name} bg={theme.swatches[0]} fg={theme.vars['--foreground']} accent={theme.swatches[1]} border={theme.vars['--border']} />
      ))}
    </div>
  );
}
