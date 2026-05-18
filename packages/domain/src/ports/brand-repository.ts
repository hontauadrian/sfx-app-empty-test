import type {
  Brand,
  CreateBrandInput,
  RenameBrandInput,
} from "../entities/brand";

// Port for Brand persistence. The concrete adapter lives in
// apps/api/src/modules/brand/data/repositories/brand.repository.ts; this
// interface keeps the domain layer free of any runtime dependency.
//
// Methods that look up an existing brand return `null` (or `false` for
// `softDeleteById`) when the row is missing OR soft-deleted. The
// controller layer turns that signal into a 404 response.
export interface BrandRepository {
  listActive(): Promise<readonly Brand[]>;
  findActiveById(id: string): Promise<Brand | null>;
  create(input: CreateBrandInput, ownerUserId: string): Promise<Brand>;
  renameById(id: string, input: RenameBrandInput): Promise<Brand | null>;
  softDeleteById(id: string): Promise<boolean>;
}
