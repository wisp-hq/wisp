import { createContext, useContext, useEffect, useState } from 'react';
import { getTheme } from '@/lib/themes';
import { useAuth } from '@/providers/auth-provider';

interface ThemePreviewContextValue {
  preview: string | null;
  setPreview: (key: string | null) => void;
}

const PreviewContext = createContext<ThemePreviewContextValue>({
  preview: null,
  setPreview: () => {},
});

export function useThemePreview() {
  return useContext(PreviewContext);
}

export function ThemeAccent({ children }: { children?: React.ReactNode }) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const key = preview ?? user?.theme ?? '';
  const theme = getTheme(key);

  useEffect(() => {
    if (!theme) {
      return;
    }

    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme.vars)) {
      root.style.setProperty(k, v);
    }
    return () => {
      for (const k of Object.keys(theme.vars)) {
        root.style.removeProperty(k);
      }
    };
  }, [theme]);

  return <PreviewContext.Provider value={{ preview, setPreview }}>{children}</PreviewContext.Provider>;
}
