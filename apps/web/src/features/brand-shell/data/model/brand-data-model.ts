export interface BrandDataModel {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
