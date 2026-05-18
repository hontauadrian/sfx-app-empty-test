import type { CommonTranslations } from '@/features/presentation/localization';
import type { AdminTab } from '../../../constants';
import type { AdminTabBarItem, AdminTabBarUIModel } from './types';

interface MapToAdminTabBarUIModelInput {
  readonly translations: CommonTranslations;
  readonly pathname: string;
  readonly registry: readonly AdminTab[];
}

export function mapToAdminTabBarUIModel(
  input: MapToAdminTabBarUIModelInput,
): AdminTabBarUIModel {
  const { translations, pathname, registry } = input;

  const items: AdminTabBarItem[] = registry.map((tab) => ({
    key: tab.id,
    label: translations.admin.tabs[tab.labelKey],
    href: tab.href,
    isActive: tab.isActive(pathname),
  }));

  return {
    navAriaLabel: translations.appName,
    items,
  };
}
