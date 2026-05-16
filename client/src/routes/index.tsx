import { createFileRoute, redirect } from '@tanstack/react-router';
import { HomePage } from '@/components/home/home-page';
import { pb } from '@/lib/pb';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (!pb.authStore.isValid || !pb.authStore.record) {
      throw redirect({ to: '/login' });
    }
  },
  component: HomePage,
});
