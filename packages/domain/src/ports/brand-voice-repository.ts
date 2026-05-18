import type {
  BrandVoice,
  UpsertBrandVoiceInput,
} from '../entities/brand-voice';

// Identifies the admin actor who performed an upsert. Threaded through
// the repository signature so Chunk D can wire snapshot writes inside
// the same transaction without changing the interface.
export interface BrandGuidelineEditor {
  readonly editorUserId: string;
  readonly editorDisplayName: string;
}

export interface BrandVoiceRepository {
  findByBrandId(brandId: string): Promise<BrandVoice | null>;
  upsertForBrand(
    brandId: string,
    input: UpsertBrandVoiceInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<BrandVoice>;
}
