import { describe, expect, it } from 'vitest';
import type { DosDontsEntryDataModel } from '../dos-donts-entry-data-model';

describe('DosDontsEntryDataModel', () => {
  it('accepts a populated entry', () => {
    const sample: DosDontsEntryDataModel = {
      id: 'dd1',
      brandId: 'b1',
      type: 'do',
      category: 'tone',
      ruleText: 'r',
      exampleText: null,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    };
    expect(sample.brandId).toBe('b1');
  });
});
