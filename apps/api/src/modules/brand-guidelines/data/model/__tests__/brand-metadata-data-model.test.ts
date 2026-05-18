import { describe, expect, it } from 'vitest';
import type { BrandMetadataRow } from '../brand-metadata-data-model';

describe('BrandMetadataRow type', () => {
  it('round-trips a representative shape', () => {
    const sample: BrandMetadataRow = {
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'subject-admin',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(sample.tags).toEqual([]);
  });
});
