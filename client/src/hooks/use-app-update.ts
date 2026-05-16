import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { triggerAppUpdate } from '@/clients/apps.client';
import type { AppRecord } from '@/lib/types';
import { useAppUpdateProgress } from '@/lib/use-pull-progress';

export function useAppUpdate(app: AppRecord) {
  const [localUpdating, setLocalUpdating] = useState(false);
  const imageStatus = app.state?.imageStatus;

  const mutation = useMutation({
    mutationFn: () => triggerAppUpdate(app.id),
    onMutate: () => setLocalUpdating(true),
    onError: () => setLocalUpdating(false),
  });

  useEffect(() => {
    if (imageStatus === 'pulling' || imageStatus === 'up_to_date' || imageStatus === 'error') {
      setLocalUpdating(false);
    }
  }, [imageStatus]);

  const isUpdating = imageStatus === 'pulling' || localUpdating;
  const progress = useAppUpdateProgress(isUpdating ? app.id : null);

  return {
    trigger: () => mutation.mutate(),
    isUpdating,
    progress,
  };
}
