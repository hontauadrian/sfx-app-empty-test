'use client';

import { useContext } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { LanguageContext } from '@/features/presentation/localization/language-provider';
import type { RequestError } from '@/features/presentation/networking';
import { useCompanyInfoVersionRepository } from '../../../data/repositories/use-company-info-version-repository';
import { mapToCompanyInfoHistoryDetailPageUIModel } from './map-to-company-info-history-detail-page-ui-model';
import type {
  UseCompanyInfoHistoryDetailInput,
  UseCompanyInfoHistoryDetailReturn,
} from './types';

function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as RequestError).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export function useCompanyInfoHistoryDetail(
  input: UseCompanyInfoHistoryDetailInput,
): UseCompanyInfoHistoryDetailReturn {
  const translations = useTranslations('common');
  const languageContext = useContext(LanguageContext);
  const locale = languageContext?.language ?? 'en';
  const { versionQuery } = useCompanyInfoVersionRepository(input.versionId);

  const errorStatus = extractStatus(versionQuery.error);
  const isDenied = errorStatus === 403;
  const isNotFound = errorStatus === 404;
  const isErrored = versionQuery.isError && !isDenied && !isNotFound;

  const uiModel = mapToCompanyInfoHistoryDetailPageUIModel({
    translations,
    version: versionQuery.data ?? null,
    isLoading: versionQuery.isLoading || input.versionId.length === 0,
    isDenied,
    isNotFound,
    isErrored,
    locale,
  });

  return { uiModel };
}
