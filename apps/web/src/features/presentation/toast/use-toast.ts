'use client';

import { useCallback, useMemo } from 'react';
import { useToastStore } from './use-toast-store';
import type { UseToastApi } from './types';

export function useToast(): UseToastApi {
  const pushToast = useToastStore((state) => state.pushToast);
  const dismissToast = useToastStore((state) => state.dismissToast);

  const success = useCallback((message: string): string => pushToast('success', message), [pushToast]);
  const error = useCallback((message: string): string => pushToast('error', message), [pushToast]);
  const dismiss = useCallback((id: string): void => dismissToast(id), [dismissToast]);

  return useMemo<UseToastApi>(() => ({ success, error, dismiss }), [success, error, dismiss]);
}
