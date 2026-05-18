// Brand profile entity.
//
// - `slug` is server-derived from `name` (NFKD + kebab-case) on create and on
//   rename. Clients never supply a slug; the API rejects unknown body keys
//   under `.strict()`.
// - `deletedAt === null` means active. `GET /api/v1/brands` filters
//   `deletedAt IS NULL`. `PATCH` / `DELETE` against a soft-deleted row
//   return 404.
// - `ownerUserId` is set on create from the authenticated request user
//   (`req.user.subject`) and never mutated by rename or delete.
export interface Brand {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface CreateBrandInput {
  readonly name: string;
}

export interface RenameBrandInput {
  readonly name: string;
}
