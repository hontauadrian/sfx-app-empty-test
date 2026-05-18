'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_BRAND_GUIDELINES_ROUTE } from '@/features/admin-shell/constants';
import type { BrandGuidelinesDetailNavigationTarget } from './types';

export function useBrandGuidelinesDetailNavigationHandler(
  target: BrandGuidelinesDetailNavigationTarget,
  onNavigated: () => void,
): void {
  const navigator = useRouter();

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'detail') {
      navigator.push(`${ADMIN_BRAND_GUIDELINES_ROUTE}/${target.brandId}`);
    } else if (target.kind === 'empty') {
      navigator.push(ADMIN_BRAND_GUIDELINES_ROUTE);
    }
    onNavigated();
  }, [target, navigator, onNavigated]);
}
