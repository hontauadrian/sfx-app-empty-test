import { describe, expect, it } from 'vitest';
import { mapToDosDontsEntry, mapToDosDontsEntryList } from '../map-to-dos-donts-entry';

describe('mapToDosDontsEntry', () => {
  const model = {
    id: 'dd1',
    brandId: 'b1',
    type: 'dont' as const,
    category: 'legal',
    ruleText: 'r',
    exampleText: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T01:00:00.000Z',
  };

  it('coerces createdAt + updatedAt to Date', () => {
    const result = mapToDosDontsEntry(model);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.id).toBe('dd1');
  });

  it('maps a list', () => {
    expect(mapToDosDontsEntryList([model])).toHaveLength(1);
  });
});
