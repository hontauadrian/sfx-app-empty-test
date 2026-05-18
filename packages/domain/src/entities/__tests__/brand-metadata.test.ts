import type {
  BrandMetadata,
  UpsertBrandMetadataInput,
} from '../brand-metadata';

describe('BrandMetadata shape', () => {
  it('accepts a populated metadata record with tags', () => {
    const metadata: BrandMetadata = {
      brandId: 'brand-1',
      ownerUserId: 'subject-admin',
      lastUpdatedAt: new Date('2026-05-10T00:00:00.000Z'),
      lastUpdatedByUserId: 'subject-admin',
      tags: ['campaign-spring', 'EN', 'press-release'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    };
    expect(metadata.tags).toHaveLength(3);
    expect(metadata.lastUpdatedByUserId).toBe('subject-admin');
  });

  it('accepts empty tags array (explicit clear)', () => {
    const metadata: BrandMetadata = {
      brandId: 'brand-1',
      ownerUserId: 'subject-admin',
      lastUpdatedAt: new Date('2026-05-10T00:00:00.000Z'),
      lastUpdatedByUserId: 'subject-admin',
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    };
    expect(metadata.tags).toEqual([]);
  });
});

describe('UpsertBrandMetadataInput', () => {
  it('omitted tags → field omitted (no mutation)', () => {
    const input: UpsertBrandMetadataInput = {};
    expect(input.tags).toBeUndefined();
  });

  it('empty tags → explicit clear', () => {
    const input: UpsertBrandMetadataInput = { tags: [] };
    expect(input.tags).toEqual([]);
  });

  it('populated tags survive the round trip', () => {
    const input: UpsertBrandMetadataInput = { tags: ['en', 'launch'] };
    expect(input.tags).toEqual(['en', 'launch']);
  });
});
