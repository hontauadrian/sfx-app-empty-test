import type { BrandProfile } from '../entities/brand-profile';

export const BRAND_PROFILE_REPOSITORY = Symbol('BRAND_PROFILE_REPOSITORY');

export interface BrandProfileCreateInput {
  readonly ownerSubject: string;
  readonly name: string;
  readonly description: string | null;
}

export interface BrandProfileUpdatePatch {
  readonly name?: string;
  readonly description?: string | null;
}

export interface IBrandProfileRepository {
  listByOwner(ownerSubject: string): Promise<BrandProfile[]>;
  findById(id: string, ownerSubject: string): Promise<BrandProfile | null>;
  create(input: BrandProfileCreateInput): Promise<BrandProfile>;
  update(
    id: string,
    ownerSubject: string,
    patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null>;
  delete(id: string, ownerSubject: string): Promise<boolean>;
}
