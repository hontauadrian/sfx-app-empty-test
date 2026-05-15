import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

export interface BrandProfile {
  readonly id: string;
  readonly ownerSubject: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function mapToBrandProfile(data: BrandProfileDataModel): BrandProfile {
  return {
    id: data.id,
    ownerSubject: data.ownerSubject,
    name: data.name,
    description: data.description,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}
