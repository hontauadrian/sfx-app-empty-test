import type { CommonTranslations } from '@/features/presentation/localization/types';
import type { BrandGuidelinesEmptyUIModel } from './types';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly isLoading: boolean;
}

export function mapToBrandGuidelinesEmptyUIModel(
  input: MapInput,
): BrandGuidelinesEmptyUIModel {
  return {
    status: input.isLoading ? 'loading' : 'ready',
    pageTitle: input.labels.pageTitle,
    emptyTitle: input.labels.emptyState.title,
    emptyMessage: input.labels.emptyState.message,
    createCtaLabel: input.labels.emptyState.createCta,
  };
}
