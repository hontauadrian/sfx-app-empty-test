import type { AdminTab } from '../../../constants';

export interface AdminTabBarItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
}

export interface AdminTabBarUIModel {
  readonly navAriaLabel: string;
  readonly items: readonly AdminTabBarItem[];
}

export interface UseAdminTabBarReturn {
  readonly uiModel: AdminTabBarUIModel;
}

export interface AdminTabBarProps {
  readonly registry?: readonly AdminTab[];
}
