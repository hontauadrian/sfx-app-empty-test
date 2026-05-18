import { describe, expect, it } from 'vitest';
import type { BrandMetadataDataModel } from '../brand-metadata-data-model';

describe('BrandMetadataDataModel', () => {
  it('accepts a populated metadata record', () => {
    const sample: BrandMetadataDataModel = {
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: '2026-05-17T00:00:00.000Z',
      lastUpdatedByUserId: 'subject-admin',
      tags: ['en'],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    };
    expect(sample.tags).toEqual(['en']);
  });
});
