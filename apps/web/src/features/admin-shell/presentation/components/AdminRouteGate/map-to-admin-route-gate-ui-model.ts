import { AUTH_ROLE_ADMIN } from '@sfx/shared';
import type { CommonTranslations } from '@/features/presentation/localization';
import type { AuthSession } from '@/features/auth';
import { HOME_ROUTE } from '../../../constants';
import type { AdminRouteGateUIModel } from './types';

interface MapToAdminRouteGateUIModelInput {
  readonly translations: CommonTranslations;
  readonly session: AuthSession | undefined;
  readonly isLoading: boolean;
}

export function mapToAdminRouteGateUIModel(
  input: MapToAdminRouteGateUIModelInput,
): AdminRouteGateUIModel {
  const { translations, session, isLoading } = input;

  if (isLoading) {
    return { status: 'loading' };
  }

  if (session && session.roles.includes(AUTH_ROLE_ADMIN)) {
    return { status: 'allowed' };
  }

  return {
    status: 'denied',
    title: translations.admin.denied.title,
    message: translations.admin.denied.message,
    backToHomeLabel: translations.admin.denied.backToHome,
    backToHomeHref: HOME_ROUTE,
  };
}
