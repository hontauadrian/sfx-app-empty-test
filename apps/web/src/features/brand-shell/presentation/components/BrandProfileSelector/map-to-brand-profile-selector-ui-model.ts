import type { Brand } from '@sfx/domain';
import type { CommonTranslations } from '@/features/presentation/localization/types';
import type {
  BrandProfileSelectorOptionUIModel,
  BrandProfileSelectorUIModel,
} from './types';

export const CREATE_NEW_OPTION_VALUE = '__create__';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly brands: readonly Brand[];
  readonly activeBrandId: string | null;
}

export function mapToBrandProfileSelectorUIModel(
  input: MapInput,
): BrandProfileSelectorUIModel {
  const options: readonly BrandProfileSelectorOptionUIModel[] = input.brands.map((brand) => ({
    value: brand.id,
    label: brand.name,
  }));
  return {
    label: input.labels.selector.label,
    placeholder: input.labels.selector.placeholder,
    options,
    createOptionLabel: input.labels.selector.createNew,
    createOptionValue: CREATE_NEW_OPTION_VALUE,
    renameLabel: input.labels.selector.rename,
    deleteLabel: input.labels.selector.delete,
    activeBrandId: input.activeBrandId,
    renameDisabled: input.activeBrandId === null,
    deleteDisabled: input.activeBrandId === null,
  };
}
