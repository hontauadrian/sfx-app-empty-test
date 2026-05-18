'use client';

import { useCallback, useState } from 'react';
import type { Brand } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import { mapToBrandGuidelinesDetailUIModel } from './map-to-brand-guidelines-detail-ui-model';
import type {
  BrandGuidelinesDetailNavigationTarget,
  BrandGuidelinesDetailPageProps,
  BrandGuidelinesDetailStatus,
  UseBrandGuidelinesDetailReturn,
} from './types';

export function useBrandGuidelinesDetail(
  props: BrandGuidelinesDetailPageProps,
): UseBrandGuidelinesDetailReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const { brandsQuery } = useBrandsRepository();
  const [navigationTarget, setNavigationTarget] =
    useState<BrandGuidelinesDetailNavigationTarget>(null);
  const [searchQuery, setSearchQueryState] = useState('');

  const brands: readonly Brand[] = brandsQuery.data ?? [];
  const activeBrand: Brand | null =
    brands.find((brand) => brand.id === props.brandId) ?? null;

  const status: BrandGuidelinesDetailStatus = brandsQuery.isLoading
    ? 'loading'
    : activeBrand
      ? 'ready'
      : 'not-found';

  const uiModel = mapToBrandGuidelinesDetailUIModel({
    labels,
    status,
    activeBrand,
  });

  const setSearchQuery = useCallback((next: string) => setSearchQueryState(next), []);

  const handleSelectBrand = useCallback((id: string) => {
    setSearchQueryState('');
    setNavigationTarget({ kind: 'detail', brandId: id });
  }, []);

  const handleCreated = useCallback((brand: Brand) => {
    setNavigationTarget({ kind: 'detail', brandId: brand.id });
  }, []);

  const handleRenamed = useCallback(() => {
    // No navigation — list update flows through the repository cache.
  }, []);

  const handleDeleted = useCallback(
    (id: string) => {
      const remaining = brands.filter((brand) => brand.id !== id);
      if (remaining.length === 0) {
        setNavigationTarget({ kind: 'empty' });
        return;
      }
      const firstRemaining = remaining[0];
      if (firstRemaining) {
        setNavigationTarget({ kind: 'detail', brandId: firstRemaining.id });
      }
    },
    [brands],
  );

  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return {
    uiModel,
    brands,
    activeBrand,
    navigationTarget,
    clearNavigationTarget,
    handleSelectBrand,
    handleCreated,
    handleRenamed,
    handleDeleted,
    searchQuery,
    setSearchQuery,
  };
}
