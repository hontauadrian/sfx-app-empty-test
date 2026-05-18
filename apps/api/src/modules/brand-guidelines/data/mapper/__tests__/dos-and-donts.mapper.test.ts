import { describe, expect, it } from 'vitest';
import { toDosDontsEntry } from '../dos-and-donts.mapper';

describe('toDosDontsEntry', () => {
  const row = {
    id: 'dd1',
    brandId: 'b1',
    type: 'dont',
    category: 'legal',
    ruleText: 'No copyrighted assets.',
    exampleText: 'e.g. Disney logo',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T01:00:00.000Z'),
  };

  it('maps row → domain entity preserving every field', () => {
    expect(toDosDontsEntry(row)).toEqual({
      id: 'dd1',
      brandId: 'b1',
      type: 'dont',
      category: 'legal',
      ruleText: 'No copyrighted assets.',
      exampleText: 'e.g. Disney logo',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  it('preserves null exampleText', () => {
    expect(toDosDontsEntry({ ...row, exampleText: null }).exampleText).toBeNull();
  });
});
