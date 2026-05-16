'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brandRoute } from '@/features/brand-profile';
import type { EditDosAndDontNavigationTarget } from './types';

export function useEditDosAndDontNavigationHandler(
  brandId: string,
  target: EditDosAndDontNavigationTarget,
  onNavigated: () => void,
): void {
  const router = useRouter();
  useEffect((): void => {
    if (target === null) return;
    router.push(brandRoute(brandId));
    onNavigated();
  }, [target, brandId, onNavigated, router]);
}
