import type { Brand } from '@sfx/domain';

export interface BrandProfileSelectorProps {
  readonly brands: readonly Brand[];
  readonly activeBrandId: string | null;
  readonly onSelectBrand: (id: string) => void;
  readonly onCreated: (brand: Brand) => void;
  readonly onRenamed: (brand: Brand) => void;
  readonly onDeleted: (id: string) => void;
}

export interface BrandProfileSelectorOptionUIModel {
  readonly value: string;
  readonly label: string;
}

export interface BrandProfileSelectorUIModel {
  readonly label: string;
  readonly placeholder: string;
  readonly options: readonly BrandProfileSelectorOptionUIModel[];
  readonly createOptionLabel: string;
  readonly createOptionValue: string;
  readonly renameLabel: string;
  readonly deleteLabel: string;
  readonly activeBrandId: string | null;
  readonly renameDisabled: boolean;
  readonly deleteDisabled: boolean;
}
