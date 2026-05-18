'use client';

import { useTranslations } from '@/features/presentation/localization';
import { useAuthSessionRepository } from '@/features/auth';
import { mapToAdminRouteGateUIModel } from './map-to-admin-route-gate-ui-model';
import type { UseAdminRouteGateReturn } from './types';

export function useAdminRouteGate(): UseAdminRouteGateReturn {
  const translations = useTranslations('common');
  const { data: session, isLoading } = useAuthSessionRepository();
  const uiModel = mapToAdminRouteGateUIModel({ translations, session, isLoading });
  return { uiModel };
}
