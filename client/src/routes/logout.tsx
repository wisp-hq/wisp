import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { pb } from '@/lib/pb';

export const Route = createFileRoute('/logout')({
  component: LogoutPage,
});

function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    pb.authStore.clear();
    navigate({ to: '/', replace: true });
  }, [navigate]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Signing out…</div>;
}
