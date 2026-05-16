import { describe, expect, it } from 'vitest';
import type { DosAndDontEntry } from '@sfx/domain';
import { groupEntries } from '../group-entries';

function entry(
  overrides: Partial<DosAndDontEntry> & Pick<DosAndDontEntry, 'category' | 'type'>,
): DosAndDontEntry {
  const now = new Date('2026-05-16T00:00:00.000Z');
  return {
    id: overrides.id ?? `${overrides.category}-${overrides.type}-${Math.random()}`,
    brandId: overrides.brandId ?? 'brand-1',
    type: overrides.type,
    category: overrides.category,
    title: overrides.title ?? 'Title',
    body: overrides.body ?? 'Body',
    suggestedCorrection: overrides.suggestedCorrection ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe('groupEntries', () => {
  it('returns an empty list when given no entries', () => {
    expect(groupEntries([])).toEqual([]);
  });

  it('orders categories per DOS_AND_DONT_CATEGORY_VALUES and Do before Dont within a category', () => {
    const entries: readonly DosAndDontEntry[] = [
      entry({ category: 'legal', type: 'dont' }),
      entry({ category: 'tone', type: 'dont' }),
      entry({ category: 'tone', type: 'do' }),
      entry({ category: 'vocabulary', type: 'do' }),
    ];
    const grouped = groupEntries(entries);
    expect(grouped.map((group) => group.category)).toEqual([
      'tone',
      'vocabulary',
      'legal',
    ]);
    const toneGroup = grouped[0];
    expect(toneGroup?.types.map((row) => row.type)).toEqual(['do', 'dont']);
  });

  it('omits categories that have no entries', () => {
    const grouped = groupEntries([entry({ category: 'tone', type: 'do' })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.category).toBe('tone');
  });

  it('skips type rows that end up empty', () => {
    const grouped = groupEntries([entry({ category: 'tone', type: 'do' })]);
    expect(grouped[0]?.types.map((row) => row.type)).toEqual(['do']);
  });
});
