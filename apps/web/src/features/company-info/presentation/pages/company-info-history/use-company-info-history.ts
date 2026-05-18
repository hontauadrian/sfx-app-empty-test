'use client';

import { useContext } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { LanguageContext } from '@/features/presentation/localization/language-provider';
import type { RequestError } from '@/features/presentation/networking';
import { useCompanyInfoVersionsRepository } from '../../../data/repositories/use-company-info-versions-repository';
import { mapToCompanyInfoHistoryPageUIModel } from './map-to-company-info-history-page-ui-model';
import type { UseCompanyInfoHistoryReturn } from './types';

function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as RequestError).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export function useCompanyInfoHistory(): UseCompanyInfoHistoryReturn {
  const translations = useTranslations('common');
  const languageContext = useContext(LanguageContext);
  const locale = languageContext?.language ?? 'en';
  const { versionsPageQuery } = useCompanyInfoVersionsRepository();

  const errorStatus = extractStatus(versionsPageQuery.error);
  const isDenied = errorStatus === 403;
  const isErrored = versionsPageQuery.isError && !isDenied;

  const uiModel = mapToCompanyInfoHistoryPageUIModel({
    translations,
    items: versionsPageQuery.data?.items,
    isLoading: versionsPageQuery.isLoading,
    isDenied,
    isErrored,
    locale,
  });

  return { uiModel };
}
