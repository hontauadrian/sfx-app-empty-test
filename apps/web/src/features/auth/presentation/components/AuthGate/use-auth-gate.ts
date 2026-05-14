'use client';

import { useTranslations } from '@/features/presentation/localization';
import { getOAuth2ProxyLogoutHref } from '@/features/auth/constants';
import { useAuthSessionRepository } from '../../../data/repositories/use-auth-session-repository';
import { mapToAuthGateUIModel } from './map-to-auth-gate-ui-model';
import type { UseAuthGateReturn } from './types';

export function useAuthGate(): UseAuthGateReturn {
  const translations = useTranslations('common');
  const { data: session, isLoading } = useAuthSessionRepository();
  const logoutHref = getOAuth2ProxyLogoutHref();
  const uiModel = mapToAuthGateUIModel({ translations, session, isLoading, logoutHref });

  return { uiModel };
}
