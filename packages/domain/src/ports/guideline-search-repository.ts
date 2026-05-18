export const GUIDELINE_SEARCH_SECTIONS = [
  'voice',
  'visual',
  'dos-and-donts',
  'metadata',
] as const;
export type GuidelineSearchSection = (typeof GUIDELINE_SEARCH_SECTIONS)[number];

export interface GuidelineSearchItem {
  readonly id: string;
  readonly sectionTitleKey: string;
  readonly matchedFieldKey: string;
  readonly fragment: string;
  readonly href: string;
}

export interface GuidelineSearchGroup {
  readonly section: GuidelineSearchSection;
  readonly items: readonly GuidelineSearchItem[];
}

export interface GuidelineSearchResult {
  readonly query: string;
  readonly brandId: string;
  readonly groups: readonly GuidelineSearchGroup[];
}

export interface GuidelineSearchRequest {
  readonly brandId: string;
  readonly query: string;
}

// Port for cross-section search over an active brand's guideline corpus.
// Concrete adapter performs ILIKE substring scans against dos_donts_entry,
// brand_metadata (jsonb tags array), and (when Chunk B has landed) brand_voice
// and visual_identity. Missing models gracefully no-op via dmmf detection.
export interface GuidelineSearchRepository {
  searchByBrand(input: GuidelineSearchRequest): Promise<GuidelineSearchResult>;
}
