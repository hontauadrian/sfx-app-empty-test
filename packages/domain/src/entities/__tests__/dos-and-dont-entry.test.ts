import { describe, expect, it } from 'vitest';
import type {
  DosAndDontCategory,
  DosAndDontEntry,
  DosAndDontType,
} from '../dos-and-dont-entry';

describe('DosAndDontEntry', () => {
  it('accepts a populated readonly shape with both type and category', () => {
    const now = new Date('2026-05-15T00:00:00.000Z');
    const entry: DosAndDontEntry = {
      id: 'entry-1',
      brandId: 'brand-1',
      type: 'do',
      category: 'tone',
      title: 'Use active voice',
      body: 'Prefer we ship over products are shipped.',
      suggestedCorrection: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(entry.title).toBe('Use active voice');
    expect(entry.suggestedCorrection).toBeNull();
  });

  it('allows every category and type literal union member', () => {
    const categories: DosAndDontCategory[] = [
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ];
    const types: DosAndDontType[] = ['do', 'dont'];
    expect(categories).toHaveLength(5);
    expect(types).toHaveLength(2);
  });

  it('permits suggestedCorrection as a populated string', () => {
    const entry: DosAndDontEntry = {
      id: 'entry-2',
      brandId: 'brand-1',
      type: 'dont',
      category: 'visuals',
      title: 'No recoloured logos',
      body: 'Never tint or recolour the primary mark.',
      suggestedCorrection: 'Use the monochrome variant.',
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    expect(entry.suggestedCorrection).toBe('Use the monochrome variant.');
  });
});
