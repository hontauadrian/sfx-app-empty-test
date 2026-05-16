import { describe, expect, it } from 'vitest';
import type { DosAndDontDataModel } from '../dos-and-dont-data-model';

describe('DosAndDontDataModel', () => {
  it('accepts a populated readonly shape', () => {
    const data: DosAndDontDataModel = {
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    expect(data.id).toBe('e-1');
  });
});
