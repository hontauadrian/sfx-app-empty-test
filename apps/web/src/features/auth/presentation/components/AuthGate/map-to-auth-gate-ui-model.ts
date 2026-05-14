import type { CommonTranslations } from '@/features/presentation/localization';
import type { AuthSession } from '../../../data/mapper/map-to-auth-session';
import type { AuthGateUIModel } from './types';

interface MapToAuthGateUIModelInput {
  readonly translations: CommonTranslations;
  readonly session: AuthSession | undefined;
  readonly isLoading: boolean;
  readonly logoutHref: string;
}

export function mapToAuthGateUIModel(input: MapToAuthGateUIModelInput): AuthGateUIModel {
  const { translations, session, isLoading, logoutHref } = input;
  const shouldRenderChildren = Boolean(session?.hasAppAccess);

  return {
    shouldRenderChildren,
    isLoading,
    title: translations.pendingAccessTitle,
    message: translations.pendingAccessMessage,
    logoutLabel: translations.logout,
    logoutHref,
  };
}
