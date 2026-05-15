export interface BrandProfileDataModel {
  readonly id: string;
  readonly ownerSubject: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
