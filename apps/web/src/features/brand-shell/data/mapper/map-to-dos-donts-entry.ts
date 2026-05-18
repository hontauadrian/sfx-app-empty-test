import type { DosDontsCategory, DosDontsEntry } from '@sfx/domain';
import type { DosDontsEntryDataModel } from '../model/dos-donts-entry-data-model';

export function mapToDosDontsEntry(model: DosDontsEntryDataModel): DosDontsEntry {
  return {
    id: model.id,
    brandId: model.brandId,
    type: model.type,
    category: model.category as DosDontsCategory,
    ruleText: model.ruleText,
    exampleText: model.exampleText,
    createdAt: new Date(model.createdAt),
    updatedAt: new Date(model.updatedAt),
  };
}

export function mapToDosDontsEntryList(
  items: readonly DosDontsEntryDataModel[],
): readonly DosDontsEntry[] {
  return items.map(mapToDosDontsEntry);
}
