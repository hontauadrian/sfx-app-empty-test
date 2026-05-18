import type {
  BrandMetadata,
  UpsertBrandMetadataInput,
} from '../entities/brand-metadata';

export interface BrandMetadataEditor {
  readonly editorUserId: string;
  readonly ownerUserId: string;
}

// Port for BrandMetadata persistence. The singleton-per-brand invariant is
// enforced by the underlying schema (PK = brandId). Upsert is idempotent.
//
// `changeNote` is threaded so the repository's transaction can also write a
// BrandGuidelinesVersion snapshot row inside the same tx (Chunk D §13).
export interface BrandMetadataRepository {
  findByBrandId(brandId: string): Promise<BrandMetadata | null>;
  upsertByBrandId(
    brandId: string,
    input: UpsertBrandMetadataInput,
    editor: BrandMetadataEditor,
    changeNote: string | null,
  ): Promise<BrandMetadata>;
}
