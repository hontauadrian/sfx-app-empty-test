import { describe, expect, it } from 'vitest';
import { toBrandMetadata } from '../brand-metadata.mapper';

describe('toBrandMetadata', () => {
  it('maps row → domain entity preserving every field', () => {
    const row = {
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: new Date('2026-05-17T01:00:00.000Z'),
      lastUpdatedByUserId: 'subject-admin',
      tags: ['en', 'spring'],
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T01:00:00.000Z'),
    };
    expect(toBrandMetadata(row)).toEqual({
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: row.lastUpdatedAt,
      lastUpdatedByUserId: 'subject-admin',
      tags: ['en', 'spring'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });
});
