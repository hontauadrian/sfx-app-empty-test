import { describe, expect, it } from 'vitest';
import type { DosAndDont } from '../../../../data/mapper/map-to-dos-and-dont';
import { groupEntries } from '../group-entries';

function entry(
  overrides: Partial<DosAndDont> & { id: string; type: DosAndDont['type']; category: DosAndDont['category'] },
): DosAndDont {
  return {
    brandId: 'b-1',
    title: overrides.id,
    body: 'b',
    suggestedCorrection: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  } as DosAndDont;
}

describe('groupEntries', () => {
  it('returns an empty array for no entries', () => {
    expect(groupEntries([])).toEqual([]);
  });

  it('groups a single entry under its category and type', () => {
    const grouped = groupEntries([entry({ id: 'e-1', type: 'do', category: 'tone' })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.category).toBe('tone');
    expect(grouped[0]?.types).toHaveLength(1);
    expect(grouped[0]?.types[0]?.type).toBe('do');
    expect(grouped[0]?.types[0]?.entries[0]?.id).toBe('e-1');
  });

  it('emits categories in the canonical order regardless of input order', () => {
    const grouped = groupEntries([
      entry({ id: 'a', type: 'do', category: 'legal' }),
      entry({ id: 'b', type: 'do', category: 'tone' }),
      entry({ id: 'c', type: 'do', category: 'campaign-messaging' }),
    ]);
    expect(grouped.map((row) => row.category)).toEqual([
      'tone',
      'legal',
      'campaign-messaging',
    ]);
  });

  it('puts do before dont within a category', () => {
    const grouped = groupEntries([
      entry({ id: 'x', type: 'dont', category: 'tone' }),
      entry({ id: 'y', type: 'do', category: 'tone' }),
    ]);
    expect(grouped[0]?.types.map((row) => row.type)).toEqual(['do', 'dont']);
  });

  it('keeps original entry order within a (category, type) bucket', () => {
    const grouped = groupEntries([
      entry({ id: 'first', type: 'do', category: 'tone' }),
      entry({ id: 'second', type: 'do', category: 'tone' }),
    ]);
    expect(grouped[0]?.types[0]?.entries.map((row) => row.id)).toEqual([
      'first',
      'second',
    ]);
  });
});
