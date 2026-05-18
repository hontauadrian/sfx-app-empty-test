import { AUTH_ROLE_ADMIN } from '@sfx/shared';
import type { CommonTranslations } from '@/features/presentation/localization';
import type { AuthSession } from '@/features/auth';
import { ADMIN_ROUTE, HOME_ROUTE } from '../../../constants';
import type { SidebarNavItem, SidebarUIModel } from './types';

interface MapToSidebarUIModelInput {
  readonly translations: CommonTranslations;
  readonly session: AuthSession | undefined;
  readonly isLoading: boolean;
  readonly pathname: string;
}

function isAdminRouteActive(pathname: string): boolean {
  return pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`);
}

export function mapToSidebarUIModel(input: MapToSidebarUIModelInput): SidebarUIModel {
  const { translations, session, isLoading, pathname } = input;

  if (isLoading) {
    return { status: 'loading' };
  }

  if (!session || !session.isAuthenticated) {
    return { status: 'hidden' };
  }

  const items: SidebarNavItem[] = [
    {
      key: 'home',
      label: translations.nav.home,
      href: HOME_ROUTE,
      isActive: pathname === HOME_ROUTE,
    },
  ];

  if (session.roles.includes(AUTH_ROLE_ADMIN)) {
    items.push({
      key: 'admin',
      label: translations.nav.admin,
      href: ADMIN_ROUTE,
      isActive: isAdminRouteActive(pathname),
    });
  }

  return {
    status: 'visible',
    items,
    navAriaLabel: translations.appName,
  };
}
