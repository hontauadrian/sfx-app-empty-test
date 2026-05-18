export const BRANDS_ENDPOINT = 'api/v1/brands';
export const BRANDS_QUERY_KEY = ['brands', 'list'] as const;

export const brandVoiceEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice`;
export const visualIdentityEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/visual`;

export const brandVoiceQueryKey = (brandId: string) =>
  ['brand-guidelines', 'voice', brandId] as const;
export const visualIdentityQueryKey = (brandId: string) =>
  ['brand-guidelines', 'visual', brandId] as const;

export interface BrandGuidelinesSubNavEntry {
  readonly id: string;
  readonly labelKey: 'voice' | 'visual' | 'dosAndDonts' | 'metadata';
  readonly slot: number;
}

export const BRAND_GUIDELINES_SUB_NAV_REGISTRY: readonly BrandGuidelinesSubNavEntry[] = [
  { id: 'voice', labelKey: 'voice', slot: 10 },
  { id: 'visual', labelKey: 'visual', slot: 20 },
  { id: 'dosAndDonts', labelKey: 'dosAndDonts', slot: 30 },
  { id: 'metadata', labelKey: 'metadata', slot: 40 },
] as const;

export const dosAndDontsEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/dos-and-donts`;

export const dosAndDontsEntryEndpoint = (brandId: string, entryId: string): string =>
  `${dosAndDontsEndpoint(brandId)}/${entryId}`;

export const brandMetadataEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/metadata`;

export const guidelineSearchEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/search`;

export const dosAndDontsQueryKey = (
  brandId: string,
  filters?: { readonly type?: string; readonly category?: string },
): readonly unknown[] =>
  [
    'brand-guidelines',
    'dos-and-donts',
    brandId,
    filters?.type ?? null,
    filters?.category ?? null,
  ] as const;

export const brandMetadataQueryKey = (brandId: string): readonly unknown[] =>
  ['brand-guidelines', 'metadata', brandId] as const;

export const guidelineSearchQueryKey = (
  brandId: string,
  query: string,
): readonly unknown[] => ['brand-guidelines', 'search', brandId, query] as const;

export const brandGuidelinesVersionsEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/versions`;

export const brandGuidelinesVersionEndpoint = (
  brandId: string,
  versionId: string,
): string => `${brandGuidelinesVersionsEndpoint(brandId)}/${versionId}`;

export const voiceRestrictedVocabularyEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/restricted-vocabulary`;

export const voiceApprovedExamplesEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/approved-examples`;

export const voiceRejectedExamplesEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/rejected-examples`;

export const brandGuidelinesVersionsQueryKey = (brandId: string): readonly unknown[] =>
  ['brand-guidelines', 'versions', brandId] as const;

export const brandGuidelinesVersionQueryKey = (
  brandId: string,
  versionId: string,
): readonly unknown[] => ['brand-guidelines', 'versions', brandId, versionId] as const;

export const agentAuditLogEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/agent-audit-log`;

export interface AgentAuditLogFilterState {
  readonly clientId?: string;
  readonly from?: string;
  readonly to?: string;
}

export const agentAuditLogQueryKey = (
  brandId: string,
  filters?: AgentAuditLogFilterState,
): readonly unknown[] =>
  [
    'brand-guidelines',
    'agent-audit-log',
    brandId,
    filters?.clientId ?? null,
    filters?.from ?? null,
    filters?.to ?? null,
  ] as const;
