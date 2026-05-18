'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_BRAND_GUIDELINES_ROUTE } from '@/features/admin-shell/constants';
import type { BrandGuidelinesEmptyNavigationTarget } from './types';

export function useBrandGuidelinesEmptyNavigationHandler(
  target: BrandGuidelinesEmptyNavigationTarget,
  onNavigated: () => void,
): void {
  const navigator = useRouter();

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'detail') {
      navigator.replace(`${ADMIN_BRAND_GUIDELINES_ROUTE}/${target.brandId}`);
    }
    onNavigated();
  }, [target, navigator, onNavigated]);
}
