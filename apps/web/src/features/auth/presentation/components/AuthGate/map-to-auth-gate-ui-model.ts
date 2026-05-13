import type { CommonTranslations } from '@/features/presentation/localization';
import { OAUTH2_PROXY_LOGOUT_HREF } from '@/features/auth/constants';
import type { AuthSession } from '../../../data/mapper/map-to-auth-session';
import type { AuthGateUIModel } from './types';

interface MapToAuthGateUIModelInput {
  readonly translations: CommonTranslations;
  readonly session: AuthSession | undefined;
  readonly isLoading: boolean;
}

export function mapToAuthGateUIModel(input: MapToAuthGateUIModelInput): AuthGateUIModel {
  const { translations, session, isLoading } = input;
  const shouldRenderChildren = Boolean(session?.hasAppAccess);

  return {
    shouldRenderChildren,
    isLoading,
    title: translations.pendingAccessTitle,
    message: translations.pendingAccessMessage,
    logoutLabel: translations.logout,
    logoutHref: OAUTH2_PROXY_LOGOUT_HREF,
  };
}
