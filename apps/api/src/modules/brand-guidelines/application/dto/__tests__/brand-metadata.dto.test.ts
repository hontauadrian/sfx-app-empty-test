import { describe, expect, it } from 'vitest';
import { BrandMetadataDto } from '../brand-metadata.dto';

describe('BrandMetadataDto', () => {
  it('is constructable as a plain object', () => {
    const dto = new BrandMetadataDto();
    dto.brandId = 'b';
    dto.ownerUserId = 'subject-owner';
    dto.lastUpdatedAt = new Date();
    dto.lastUpdatedByUserId = 'subject-admin';
    dto.tags = [];
    dto.createdAt = new Date();
    dto.updatedAt = new Date();
    expect(dto.brandId).toBe('b');
  });
});
