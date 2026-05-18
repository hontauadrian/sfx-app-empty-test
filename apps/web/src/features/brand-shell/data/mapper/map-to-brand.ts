import type { Brand } from '@sfx/domain';
import type { BrandDataModel } from '../model/brand-data-model';

export function mapToBrand(data: BrandDataModel): Brand {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    ownerUserId: data.ownerUserId,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
  };
}

export function mapToBrandList(items: readonly BrandDataModel[]): readonly Brand[] {
  return items.map(mapToBrand);
}
