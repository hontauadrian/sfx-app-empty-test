'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import { mapToBrandGuidelinesEmptyUIModel } from './map-to-brand-guidelines-empty-ui-model';
import type {
  BrandGuidelinesEmptyNavigationTarget,
  UseBrandGuidelinesEmptyReturn,
} from './types';

export function useBrandGuidelinesEmpty(): UseBrandGuidelinesEmptyReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const { brandsQuery } = useBrandsRepository();
  const [createOpen, setCreateOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] =
    useState<BrandGuidelinesEmptyNavigationTarget>(null);
  // Gate the auto-redirect to a single firing per session so a parent
  // re-render with a fresh brandsQuery.data reference does not re-fire the
  // navigation effect after the router transition has been kicked off.
  const redirectedRef = useRef(false);

  const uiModel = mapToBrandGuidelinesEmptyUIModel({
    labels,
    isLoading: brandsQuery.isLoading,
  });

  // If a brand list arrives non-empty, redirect once to the newest entry.
  const brands = brandsQuery.data;
  const newestBrandId = brands && brands.length > 0 ? brands[0]?.id : null;
  useEffect(() => {
    if (brandsQuery.isLoading || brandsQuery.isError) return;
    if (!newestBrandId) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    setNavigationTarget({ kind: 'detail', brandId: newestBrandId });
  }, [newestBrandId, brandsQuery.isLoading, brandsQuery.isError]);

  const handleOpenCreate = useCallback(() => setCreateOpen(true), []);
  const handleCloseCreate = useCallback(() => setCreateOpen(false), []);

  const handleCreated = useCallback((brandId: string) => {
    redirectedRef.current = true;
    setNavigationTarget({ kind: 'detail', brandId });
  }, []);

  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return {
    uiModel,
    createOpen,
    navigationTarget,
    clearNavigationTarget,
    handleOpenCreate,
    handleCloseCreate,
    handleCreated,
  };
}
