import type { BrandVoice } from './brand-voice';
import type { VisualIdentity } from './visual-identity';
import type { DosDontsEntry } from './dos-donts-entry';
import type { BrandMetadata } from './brand-metadata';

// Immutable composition of all four guideline sub-resources at a point
// in time. JSON-stored on disk; the repository mapper rehydrates Date
// fields and array shapes when reading.
export interface BrandGuidelinesSnapshot {
  readonly voice: BrandVoice | null;
  readonly visual: VisualIdentity | null;
  readonly dosAndDonts: readonly DosDontsEntry[];
  readonly metadata: BrandMetadata | null;
}

export interface BrandGuidelinesVersion {
  readonly id: string;
  readonly brandId: string;
  readonly snapshot: BrandGuidelinesSnapshot;
  readonly editorUserId: string;
  readonly editorDisplayName: string;
  readonly changeNote: string | null;
  readonly createdAt: Date;
}

// Cursor-style newest-first pagination — mirrors
// ListCompanyInfoVersionsInput. `take` is clamped to [1, 100] at the
// controller via Zod (default 50 applied at the controller level).
export interface ListBrandGuidelinesVersionsInput {
  readonly brandId: string;
  readonly take: number;
  readonly cursor?: string;
  readonly q?: string;
}

export interface ListBrandGuidelinesVersionsResult {
  readonly items: readonly BrandGuidelinesVersion[];
  readonly nextCursor: string | null;
}
