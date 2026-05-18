import type { BrandMetadata } from '@sfx/domain';
import type { BrandMetadataDataModel } from '../model/brand-metadata-data-model';

export function mapToBrandMetadata(model: BrandMetadataDataModel): BrandMetadata {
  return {
    brandId: model.brandId,
    ownerUserId: model.ownerUserId,
    lastUpdatedAt: new Date(model.lastUpdatedAt),
    lastUpdatedByUserId: model.lastUpdatedByUserId,
    tags: model.tags,
    createdAt: new Date(model.createdAt),
    updatedAt: new Date(model.updatedAt),
  };
}
