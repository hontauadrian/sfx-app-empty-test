'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import {
  deriveDashboardSideEffect,
  mapToDashboardPageUIModel,
} from './map-to-dashboard-page-ui-model';
import type { UseDashboardReturn } from './types';

export function useDashboard(): UseDashboardReturn {
  const translations = useTranslations('common');
  const router = useRouter();
  const { data: brands, isLoading, isError } = useBrandsRepository();
  const storedActiveBrandId = useActiveBrandStore((state) => state.activeBrandId);
  const setActiveBrandId = useActiveBrandStore((state) => state.setActiveBrandId);
  const clearStore = useActiveBrandStore((state) => state.clear);

  useEffect(() => {
    if (isLoading || isError) return;
    const sideEffect = deriveDashboardSideEffect(brands, storedActiveBrandId);
    if (sideEffect.shouldClearStore) clearStore();
    if (
      sideEffect.nextActiveBrandId !== null &&
      sideEffect.nextActiveBrandId !== storedActiveBrandId
    ) {
      setActiveBrandId(sideEffect.nextActiveBrandId);
    }
    if (sideEffect.redirectTo !== null) router.replace(sideEffect.redirectTo);
  }, [brands, isLoading, isError, storedActiveBrandId, clearStore, setActiveBrandId, router]);

  const uiModel = mapToDashboardPageUIModel({
    translations,
    brands,
    storedActiveBrandId,
    isLoading,
    isError,
  });

  return { uiModel };
}
