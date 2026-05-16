import { describe, expect, it } from 'vitest';
import { mapToDosAndDont } from '../map-to-dos-and-dont';

describe('mapToDosAndDont', () => {
  it('coerces ISO timestamps to Date and preserves type literal unions', () => {
    const entry = mapToDosAndDont({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.updatedAt).toBeInstanceOf(Date);
    expect(entry.createdAt.toISOString()).toBe('2026-05-15T00:00:00.000Z');
    expect(entry.type).toBe('do');
    expect(entry.category).toBe('tone');
  });

  it('passes suggestedCorrection through when populated', () => {
    const entry = mapToDosAndDont({
      id: 'e-2',
      brandId: 'b-1',
      type: 'dont',
      category: 'visuals',
      title: 't',
      body: 'b',
      suggestedCorrection: 'fix',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(entry.suggestedCorrection).toBe('fix');
  });
});
