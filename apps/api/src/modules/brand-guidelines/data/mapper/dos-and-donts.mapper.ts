import type {
  DosDontsCategory,
  DosDontsEntry,
  DosDontsType,
} from '@sfx/domain';
import type { DosDontsRow } from '../model/dos-and-donts-data-model';

export function toDosDontsEntry(row: DosDontsRow): DosDontsEntry {
  return {
    id: row.id,
    brandId: row.brandId,
    type: row.type as DosDontsType,
    category: row.category as DosDontsCategory,
    ruleText: row.ruleText,
    exampleText: row.exampleText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
