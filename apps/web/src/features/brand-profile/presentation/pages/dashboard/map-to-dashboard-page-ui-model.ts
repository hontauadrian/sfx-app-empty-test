import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandProfile } from '../../../data/mapper/map-to-brand-profile';
import { brandRoute, NEW_BRAND_ROUTE } from '../../../constants';
import type { DashboardPageUIModel } from './types';

interface MapToDashboardInput {
  readonly translations: CommonTranslations;
  readonly brands: readonly BrandProfile[] | undefined;
  readonly storedActiveBrandId: string | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export interface DashboardSideEffect {
  readonly nextActiveBrandId: string | null;
  readonly redirectTo: string | null;
  readonly shouldClearStore: boolean;
}

export function deriveDashboardSideEffect(
  brands: readonly BrandProfile[] | undefined,
  storedActiveBrandId: string | null,
): DashboardSideEffect {
  if (!brands || brands.length === 0) {
    return {
      nextActiveBrandId: null,
      redirectTo: null,
      shouldClearStore: storedActiveBrandId !== null,
    };
  }
  if (storedActiveBrandId !== null) {
    const exists = brands.some((entry) => entry.id === storedActiveBrandId);
    if (!exists) {
      return { nextActiveBrandId: null, redirectTo: null, shouldClearStore: true };
    }
    return {
      nextActiveBrandId: storedActiveBrandId,
      redirectTo: brandRoute(storedActiveBrandId),
      shouldClearStore: false,
    };
  }
  const sorted = [...brands].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
  const mostRecent = sorted[0];
  if (!mostRecent) {
    return { nextActiveBrandId: null, redirectTo: null, shouldClearStore: false };
  }
  return {
    nextActiveBrandId: mostRecent.id,
    redirectTo: brandRoute(mostRecent.id),
    shouldClearStore: false,
  };
}

export function mapToDashboardPageUIModel(input: MapToDashboardInput): DashboardPageUIModel {
  const { translations, brands, storedActiveBrandId, isLoading, isError } = input;
  const showEmptyState = !isLoading && !isError && (brands?.length ?? 0) === 0;
  const sideEffect = deriveDashboardSideEffect(brands, storedActiveBrandId);

  return {
    isLoading,
    hasError: isError,
    emptyStateTitle: translations.noBrandsTitle,
    emptyStateBody: translations.noBrandsBody,
    emptyStateCtaLabel: translations.noBrandsCta,
    emptyStateCtaHref: NEW_BRAND_ROUTE,
    showEmptyState,
    redirectTo: sideEffect.redirectTo,
    loadingLabel: translations.loading,
    errorLabel: translations.error,
  };
}
