import type { DosAndDontCategory, DosAndDontEntry, DosAndDontType } from '@sfx/domain';
import { DOS_AND_DONT_CATEGORY_VALUES } from '@sfx/validation';

const TYPE_ORDER: readonly DosAndDontType[] = ['do', 'dont'];

export interface ContentCheckGroupedTypeRow {
  readonly type: DosAndDontType;
  readonly entries: readonly DosAndDontEntry[];
}

export interface ContentCheckGroupedCategory {
  readonly category: DosAndDontCategory;
  readonly types: readonly ContentCheckGroupedTypeRow[];
}

export function groupEntries(
  entries: readonly DosAndDontEntry[],
): readonly ContentCheckGroupedCategory[] {
  if (entries.length === 0) return [];
  const byCategory = new Map<
    DosAndDontCategory,
    Map<DosAndDontType, DosAndDontEntry[]>
  >();
  for (const entry of entries) {
    const catBucket =
      byCategory.get(entry.category) ??
      new Map<DosAndDontType, DosAndDontEntry[]>();
    const typeBucket = catBucket.get(entry.type) ?? [];
    typeBucket.push(entry);
    catBucket.set(entry.type, typeBucket);
    byCategory.set(entry.category, catBucket);
  }
  const result: ContentCheckGroupedCategory[] = [];
  for (const category of DOS_AND_DONT_CATEGORY_VALUES) {
    const catBucket = byCategory.get(category);
    if (!catBucket) continue;
    const types: ContentCheckGroupedTypeRow[] = [];
    for (const type of TYPE_ORDER) {
      const typeEntries = catBucket.get(type);
      if (!typeEntries || typeEntries.length === 0) continue;
      types.push({ type, entries: typeEntries });
    }
    if (types.length > 0) result.push({ category, types });
  }
  return result;
}
