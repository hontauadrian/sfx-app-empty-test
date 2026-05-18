'use client';

import { useTranslations } from '@/features/presentation/localization';
import { useBrandGuidelinesVersionRepository } from '../../../data/repositories/use-brand-guidelines-version-repository';
import { mapToBrandGuidelinesHistoryDetailPageUIModel } from './map-to-brand-guidelines-history-detail-page-ui-model';
import type {
  BrandGuidelinesHistoryDetailPageUIModel,
  BrandGuidelinesHistoryDetailStatus,
} from './types';

interface RequestErrorLike {
  readonly status?: number;
}

function deriveStatus(
  isLoading: boolean,
  isError: boolean,
  rawError: unknown,
): BrandGuidelinesHistoryDetailStatus {
  if (isLoading) return 'loading';
  if (isError) {
    const status =
      typeof (rawError as RequestErrorLike)?.status === 'number'
        ? (rawError as RequestErrorLike).status
        : undefined;
    if (status === 403) return 'denied';
    if (status === 404) return 'not-found';
    return 'error';
  }
  return 'ready';
}

export interface UseBrandGuidelinesHistoryDetailReturn {
  readonly uiModel: BrandGuidelinesHistoryDetailPageUIModel;
}

export function useBrandGuidelinesHistoryDetail(
  brandId: string,
  versionId: string,
): UseBrandGuidelinesHistoryDetailReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines.historyDetail!;
  const query = useBrandGuidelinesVersionRepository(brandId, versionId);
  const status = deriveStatus(query.isLoading, query.isError, query.error);
  return {
    uiModel: mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId,
      status,
      version: query.data,
      translations: labels,
    }),
  };
}
