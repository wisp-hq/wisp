import { createRootRoute, Outlet } from '@tanstack/react-router';
import { GamepadHints } from '@/components/atoms/gamepad-hints';
import { PwaInstallBanner } from '@/components/atoms/pwa-install-banner';
import { SpatialNavProvider } from '@/lib/spatial-nav';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeAccent } from '@/providers/theme-accent';

export const Route = createRootRoute({
  component: () => (
    <QueryProvider>
      <AuthProvider>
        <ThemeAccent>
          <SpatialNavProvider>
            <Outlet />
            <GamepadHints />
            <PwaInstallBanner />
          </SpatialNavProvider>
        </ThemeAccent>
      </AuthProvider>
    </QueryProvider>
  ),
});
