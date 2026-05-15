export interface BrandProfile {
  readonly id: string;
  readonly ownerSubject: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
