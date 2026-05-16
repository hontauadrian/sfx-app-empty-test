import type { DosAndDont } from '../../../data/mapper/map-to-dos-and-dont';
import {
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TYPE_VALUES,
} from '../../../constants';
import type { DosAndDontCategory, DosAndDontType } from '@sfx/validation';

export interface DosAndDontGroupedTypeRow {
  readonly type: DosAndDontType;
  readonly entries: readonly DosAndDont[];
}

export interface DosAndDontGroupedCategory {
  readonly category: DosAndDontCategory;
  readonly types: readonly DosAndDontGroupedTypeRow[];
}

export function groupEntries(
  entries: readonly DosAndDont[],
): readonly DosAndDontGroupedCategory[] {
  if (entries.length === 0) return [];
  const byCategory = new Map<DosAndDontCategory, Map<DosAndDontType, DosAndDont[]>>();
  for (const entry of entries) {
    const catBucket =
      byCategory.get(entry.category) ?? new Map<DosAndDontType, DosAndDont[]>();
    const typeBucket = catBucket.get(entry.type) ?? [];
    typeBucket.push(entry);
    catBucket.set(entry.type, typeBucket);
    byCategory.set(entry.category, catBucket);
  }
  const result: DosAndDontGroupedCategory[] = [];
  for (const category of DOS_AND_DONT_CATEGORY_VALUES) {
    const catBucket = byCategory.get(category);
    if (!catBucket) continue;
    const types: DosAndDontGroupedTypeRow[] = [];
    for (const type of DOS_AND_DONT_TYPE_VALUES) {
      const typeEntries = catBucket.get(type);
      if (!typeEntries || typeEntries.length === 0) continue;
      types.push({ type, entries: typeEntries });
    }
    if (types.length > 0) result.push({ category, types });
  }
  return result;
}
