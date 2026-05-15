'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useAuthSessionRepository } from '@/features/auth';
import { getOAuth2ProxyLogoutHref } from '@/features/auth/constants';
import { useBrandsRepository } from '@/features/brand-profile/data/repositories/use-brands-repository';
import { brandRoute, NEW_BRAND_ROUTE } from '@/features/brand-profile/constants';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { mapToAppShellUIModel } from './map-to-app-shell-ui-model';
import type { UseAppShellReturn } from './types';

export function useAppShell(): UseAppShellReturn {
  const translations = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useAuthSessionRepository();
  const { data: brands } = useBrandsRepository();
  const activeBrandId = useActiveBrandStore((state) => state.activeBrandId);
  const setActiveBrandId = useActiveBrandStore((state) => state.setActiveBrandId);

  const handleSelectBrand = useCallback(
    (id: string): void => {
      setActiveBrandId(id);
      router.push(brandRoute(id));
    },
    [router, setActiveBrandId],
  );

  const handleCreateBrand = useCallback((): void => {
    router.push(NEW_BRAND_ROUTE);
  }, [router]);

  const uiModel = mapToAppShellUIModel({
    translations,
    brands: brands ?? [],
    activeBrandId,
    pathname,
    email: session?.email ?? null,
    signOutHref: getOAuth2ProxyLogoutHref(),
  });

  return { uiModel, handleSelectBrand, handleCreateBrand };
}
