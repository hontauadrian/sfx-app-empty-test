// @sfx/domain — shared business entities and repository ports.
// Type-only barrel for the existing surfaces; Chunk C introduces small runtime
// constants (DOS_DONTS_TYPES, DOS_DONTS_CATEGORIES, GUIDELINE_SEARCH_SECTIONS)
// because the categorical enums are consumed by Zod schemas + UI maps.
export type { CompanyInfo, UpsertCompanyInfoInput } from './entities/company-info';
export type {
  CompanyInfoVersion,
  ListCompanyInfoVersionsInput,
  ListCompanyInfoVersionsResult,
} from './entities/company-info-version';
export type {
  CompanyInfoRepository,
  CompanyInfoEditor,
} from './ports/company-info-repository';
export type {
  Brand,
  CreateBrandInput,
  RenameBrandInput,
} from './entities/brand';
export type { BrandRepository } from './ports/brand-repository';

export {
  DOS_DONTS_TYPES,
  DOS_DONTS_CATEGORIES,
} from './entities/dos-donts-entry';
export type {
  DosDontsType,
  DosDontsCategory,
  DosDontsEntry,
  CreateDosDontsEntryInput,
  UpdateDosDontsEntryInput,
  ListDosDontsFilters,
} from './entities/dos-donts-entry';

export type {
  BrandMetadata,
  UpsertBrandMetadataInput,
} from './entities/brand-metadata';

export type { DosDontsRepository } from './ports/dos-donts-repository';
export type {
  BrandMetadataRepository,
  BrandMetadataEditor,
} from './ports/brand-metadata-repository';

export { GUIDELINE_SEARCH_SECTIONS } from './ports/guideline-search-repository';
export type {
  GuidelineSearchSection,
  GuidelineSearchItem,
  GuidelineSearchGroup,
  GuidelineSearchResult,
  GuidelineSearchRequest,
  GuidelineSearchRepository,
} from './ports/guideline-search-repository';

export type {
  BrandVoice,
  BrandVoiceMessagingPillar,
  BrandVoiceAudienceRule,
  BrandVoiceApprovedExample,
  BrandVoiceRejectedExample,
  UpsertBrandVoiceInput,
  UpsertBrandVoiceRejectedExampleInput,
} from './entities/brand-voice';
export type {
  BrandVoiceRepository,
  BrandGuidelineEditor,
} from './ports/brand-voice-repository';
export type {
  VisualIdentity,
  VisualIdentityColorPaletteEntry,
  VisualIdentityTypographyEntry,
  UpsertVisualIdentityInput,
  UpsertVisualIdentityColorPaletteEntryInput,
  UpsertVisualIdentityTypographyEntryInput,
} from './entities/visual-identity';
export type { VisualIdentityRepository } from './ports/visual-identity-repository';

export type {
  BrandGuidelinesVersion,
  BrandGuidelinesSnapshot,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from './entities/brand-guidelines-version';
export type { BrandGuidelinesVersionRepository } from './ports/brand-guidelines-version-repository';

export type {
  AgentAuditLog,
  CreateAgentAuditLogInput,
  ListAgentAuditLogsInput,
  ListAgentAuditLogsResult,
} from './entities/agent-audit-log';
export type { AgentAuditLogRepository } from './ports/agent-audit-log-repository';
