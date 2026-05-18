import { describe, expect, it } from 'vitest';
import type { DosDontsRow } from '../dos-and-donts-data-model';

describe('DosDontsRow type', () => {
  it('round-trips a representative shape', () => {
    const sample: DosDontsRow = {
      id: 'dd1',
      brandId: 'b1',
      type: 'do',
      category: 'tone',
      ruleText: 'rule',
      exampleText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(sample.brandId).toBe('b1');
    expect(sample.exampleText).toBeNull();
  });
});
