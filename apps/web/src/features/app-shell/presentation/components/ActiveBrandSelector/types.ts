export interface ActiveBrandOption {
  readonly id: string;
  readonly name: string;
}

export interface ActiveBrandSelectorProps {
  readonly selectLabel: string;
  readonly currentBrandName: string | null;
  readonly options: readonly ActiveBrandOption[];
  readonly createBrandLabel: string;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
}
