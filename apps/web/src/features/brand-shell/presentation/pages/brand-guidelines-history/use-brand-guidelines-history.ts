'use client';

import { useTranslations } from '@/features/presentation/localization';
import { useBrandGuidelinesVersionsRepository } from '../../../data/repositories/use-brand-guidelines-versions-repository';
import {
  mapToBrandGuidelinesHistoryPageUIModel,
  type MapToBrandGuidelinesHistoryPageUIModelInput,
} from './map-to-brand-guidelines-history-page-ui-model';
import type {
  BrandGuidelinesHistoryPageUIModel,
  BrandGuidelinesHistoryStatus,
} from './types';

interface RequestErrorLike {
  readonly status?: number;
}

function deriveStatus(
  isLoading: boolean,
  isError: boolean,
  rawError: unknown,
  hasItems: boolean,
): BrandGuidelinesHistoryStatus {
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
  return hasItems ? 'ready' : 'empty';
}

export interface UseBrandGuidelinesHistoryReturn {
  readonly uiModel: BrandGuidelinesHistoryPageUIModel;
}

export function useBrandGuidelinesHistory(
  brandId: string,
): UseBrandGuidelinesHistoryReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines.history!;
  const query = useBrandGuidelinesVersionsRepository(brandId);
  const items = query.data?.items ?? [];
  const status = deriveStatus(
    query.isLoading,
    query.isError,
    query.error,
    items.length > 0,
  );
  const input: MapToBrandGuidelinesHistoryPageUIModelInput = {
    brandId,
    status,
    versions: items,
    translations: labels,
  };
  return { uiModel: mapToBrandGuidelinesHistoryPageUIModel(input) };
}
