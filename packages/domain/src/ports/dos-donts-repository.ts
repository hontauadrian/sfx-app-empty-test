import type {
  CreateDosDontsEntryInput,
  DosDontsEntry,
  ListDosDontsFilters,
  UpdateDosDontsEntryInput,
} from '../entities/dos-donts-entry';
import type { BrandGuidelineEditor } from './brand-voice-repository';

// Port for DosDontsEntry persistence. Concrete adapter lives in
// apps/api/src/modules/brand-guidelines/data/repositories/dos-and-donts.repository.ts.
//
// Methods that look up an existing entry return `null` (or `false` for
// `deleteInBrandById`) when the row is missing. The controller layer turns
// that signal into a 404 response.
//
// Mutating methods receive `editor` + `changeNote` so the repository's
// transaction can write a BrandGuidelinesVersion snapshot row inside the
// same tx (Chunk D §13 carve-out).
export interface DosDontsRepository {
  listByBrand(brandId: string, filters: ListDosDontsFilters): Promise<readonly DosDontsEntry[]>;
  findByIdInBrand(brandId: string, entryId: string): Promise<DosDontsEntry | null>;
  createInBrand(
    brandId: string,
    input: CreateDosDontsEntryInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<DosDontsEntry>;
  updateInBrandById(
    brandId: string,
    entryId: string,
    input: UpdateDosDontsEntryInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<DosDontsEntry | null>;
  deleteInBrandById(
    brandId: string,
    entryId: string,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<boolean>;
}
