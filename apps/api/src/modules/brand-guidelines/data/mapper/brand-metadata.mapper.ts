import type { BrandMetadata } from '@sfx/domain';
import type { BrandMetadataRow } from '../model/brand-metadata-data-model';

export function toBrandMetadata(row: BrandMetadataRow): BrandMetadata {
  return {
    brandId: row.brandId,
    ownerUserId: row.ownerUserId,
    lastUpdatedAt: row.lastUpdatedAt,
    lastUpdatedByUserId: row.lastUpdatedByUserId,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
