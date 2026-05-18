export interface BrandMetadataDataModel {
  readonly brandId: string;
  readonly ownerUserId: string;
  readonly lastUpdatedAt: string;
  readonly lastUpdatedByUserId: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
