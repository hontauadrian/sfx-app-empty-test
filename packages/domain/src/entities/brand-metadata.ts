// BrandMetadata — singleton per brand.
//
// - PK is `brandId` so the DB enforces "at most one metadata row per brand".
// - `ownerUserId` mirrors Brand.ownerUserId, displayed read-only.
// - `tags` follow the Phase-2 `coreValues` convention: undefined = field omitted,
//   `[]` = explicit clear, never null.
export interface BrandMetadata {
  readonly brandId: string;
  readonly ownerUserId: string;
  readonly lastUpdatedAt: Date;
  readonly lastUpdatedByUserId: string;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertBrandMetadataInput {
  readonly tags?: readonly string[];
}
