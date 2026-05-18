import { describe, expect, it } from 'vitest';
import { mapToBrandMetadata } from '../map-to-brand-metadata';

describe('mapToBrandMetadata', () => {
  it('coerces timestamps and preserves tags', () => {
    const result = mapToBrandMetadata({
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: '2026-05-17T00:00:00.000Z',
      lastUpdatedByUserId: 'subject-admin',
      tags: ['en'],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(result.lastUpdatedAt).toBeInstanceOf(Date);
    expect(result.tags).toEqual(['en']);
  });
});
