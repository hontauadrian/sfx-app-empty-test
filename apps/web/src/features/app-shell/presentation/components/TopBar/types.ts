import type { ActiveBrandOption } from '../ActiveBrandSelector/types';

export interface TopBarProps {
  readonly brandMarkLabel: string;
  readonly brandMarkHref: string;
  readonly selectBrandLabel: string;
  readonly currentBrandName: string | null;
  readonly brandOptions: readonly ActiveBrandOption[];
  readonly createBrandLabel: string;
  readonly signOutLabel: string;
  readonly signOutHref: string;
  readonly email: string | null;
  readonly onSelectBrand: (id: string) => void;
  readonly onCreateBrand: () => void;
}
