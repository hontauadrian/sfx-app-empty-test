'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brandRoute } from '@/features/brand-profile';
import type { NewDosAndDontNavigationTarget } from './types';

export function useNewDosAndDontNavigationHandler(
  brandId: string,
  target: NewDosAndDontNavigationTarget,
  onNavigated: () => void,
): void {
  const router = useRouter();
  useEffect((): void => {
    if (target === null) return;
    router.push(brandRoute(brandId));
    onNavigated();
  }, [target, brandId, onNavigated, router]);
}
