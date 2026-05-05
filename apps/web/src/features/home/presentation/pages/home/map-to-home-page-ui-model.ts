import type { CommonTranslations } from '@/features/presentation/localization';
import type { HealthStatus } from '@/features/home/data/mapper/map-to-health';
import { API_DOCS_HREF } from '@/features/home/constants';
import type { HomePageUIModel } from './types';

interface MapToHomePageUIModelInput {
  readonly translations: CommonTranslations;
  readonly health: HealthStatus | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export function mapToHomePageUIModel(input: MapToHomePageUIModelInput): HomePageUIModel {
  const { translations, health, isLoading, isError } = input;

  let statusText = translations.loading;
  if (!isLoading && health) {
    statusText = health.isHealthy ? translations.connected : translations.disconnected;
  }
  if (isError) {
    statusText = translations.disconnected;
  }

  return {
    title: translations.appName,
    healthLabel: translations.healthStatus,
    statusText,
    isLoading,
    isHealthy: health?.isHealthy ?? false,
    isError,
    ctaLabel: translations.apiDocs,
    ctaHref: API_DOCS_HREF,
  };
}
