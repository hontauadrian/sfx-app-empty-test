'use client';

import { useTranslations } from '@/features/presentation/localization';
import { useHealthRepository } from '@/features/home/data/repositories/use-health-repository';
import { mapToHomePageUIModel } from './map-to-home-page-ui-model';
import type { UseHomeReturn } from './types';

export function useHome(): UseHomeReturn {
  const translations = useTranslations('common');
  const { data: health, isLoading, isError } = useHealthRepository();

  const uiModel = mapToHomePageUIModel({
    translations,
    health,
    isLoading,
    isError,
  });

  return { uiModel };
}
