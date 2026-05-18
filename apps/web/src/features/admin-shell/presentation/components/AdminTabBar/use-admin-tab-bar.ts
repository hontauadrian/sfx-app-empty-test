'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { ADMIN_TAB_REGISTRY, type AdminTab } from '../../../constants';
import { mapToAdminTabBarUIModel } from './map-to-admin-tab-bar-ui-model';
import type { UseAdminTabBarReturn } from './types';

export function useAdminTabBar(
  registry: readonly AdminTab[] = ADMIN_TAB_REGISTRY,
): UseAdminTabBarReturn {
  const translations = useTranslations('common');
  const pathname = usePathname() ?? '/';
  const uiModel = mapToAdminTabBarUIModel({ translations, pathname, registry });
  return { uiModel };
}
