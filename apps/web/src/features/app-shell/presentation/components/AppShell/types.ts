import type { ReactNode } from 'react';
import type { LeftNavItem } from '../LeftNav/types';
import type { ActiveBrandOption } from '../ActiveBrandSelector/types';

export interface AppShellUIModel {
  readonly brandMarkLabel: string;
  readonly brandMarkHref: string;
  readonly selectBrandLabel: string;
  readonly currentBrandName: string | null;
  readonly brandOptions: readonly ActiveBrandOption[];
  readonly createBrandLabel: string;
  readonly signOutLabel: string;
  readonly signOutHref: string;
  readonly email: string | null;
  readonly leftNavItems: readonly LeftNavItem[] | null;
  readonly leftNavLabel: string;
}

export interface AppShellProps {
  readonly children: ReactNode;
}

export interface UseAppShellReturn {
  readonly uiModel: AppShellUIModel;
  readonly handleSelectBrand: (id: string) => void;
  readonly handleCreateBrand: () => void;
}
