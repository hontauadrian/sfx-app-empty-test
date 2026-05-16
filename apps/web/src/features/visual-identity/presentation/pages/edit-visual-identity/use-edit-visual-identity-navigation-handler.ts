'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brandRoute } from '@/features/brand-profile';
import type { EditVisualIdentityNavigationTarget } from './types';

export function useEditVisualIdentityNavigationHandler(
  brandId: string,
  target: EditVisualIdentityNavigationTarget,
  onNavigated: () => void,
): void {
  const routerNav = useRouter();

  useEffect((): void => {
    if (target === null) return;
    routerNav.push(brandRoute(brandId));
    onNavigated();
  }, [target, brandId, onNavigated, routerNav]);
}
