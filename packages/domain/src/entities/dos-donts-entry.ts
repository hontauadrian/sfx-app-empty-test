// DosDontsEntry — per-brand editorial rule.
//
// - `type` is `'do' | 'dont'` (no apostrophe so URL / query-string and JSON shapes stay ASCII-safe).
// - `category` is constrained to `DOS_DONTS_CATEGORIES` at the domain + Zod layer. Column type is
//   `text` so a future 6th value is a single-file edit (this file + the EN/RO translation maps).
// - Multiple rows per brand. No soft-delete: deletion is admin-intentional.
export const DOS_DONTS_TYPES = ['do', 'dont'] as const;
export type DosDontsType = (typeof DOS_DONTS_TYPES)[number];

export const DOS_DONTS_CATEGORIES = [
  'tone',
  'vocabulary',
  'visuals',
  'legal',
  'campaign-messaging',
] as const;
export type DosDontsCategory = (typeof DOS_DONTS_CATEGORIES)[number];

export interface DosDontsEntry {
  readonly id: string;
  readonly brandId: string;
  readonly type: DosDontsType;
  readonly category: DosDontsCategory;
  readonly ruleText: string;
  readonly exampleText: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDosDontsEntryInput {
  readonly type: DosDontsType;
  readonly category: DosDontsCategory;
  readonly ruleText: string;
  readonly exampleText?: string | null;
}

export interface UpdateDosDontsEntryInput {
  readonly type?: DosDontsType;
  readonly category?: DosDontsCategory;
  readonly ruleText?: string;
  readonly exampleText?: string | null;
}

export interface ListDosDontsFilters {
  readonly type?: DosDontsType;
  readonly category?: DosDontsCategory;
}
