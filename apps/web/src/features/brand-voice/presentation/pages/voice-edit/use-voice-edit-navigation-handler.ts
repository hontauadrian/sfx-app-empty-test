'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brandRoute } from '@/features/brand-profile';
import type { VoiceEditNavigationTarget } from './types';

export function useVoiceEditNavigationHandler(
  brandId: string,
  target: VoiceEditNavigationTarget,
  onNavigated: () => void,
): void {
  const routerNav = useRouter();

  useEffect((): void => {
    if (target === null) return;
    routerNav.push(brandRoute(brandId));
    onNavigated();
  }, [target, brandId, onNavigated, routerNav]);
}
