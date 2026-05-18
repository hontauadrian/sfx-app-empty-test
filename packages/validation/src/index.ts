// IMPORTANT: import `./openapi` first for the side-effect of extending Zod
// with `.openapi()` before any schema is defined downstream.
export { zodToOpenApi, zodApiBody, getOpenApiSchemas } from './openapi';

export { paginationSchema } from './schemas/common.schema';
export type { PaginationInput } from './schemas/common.schema';
export { idParamSchema } from './schemas/common.schema';
export type { IdParamInput } from './schemas/common.schema';

export {
  upsertCompanyInfoSchema,
  companyInfoResponseSchema,
  companyInfoVersionResponseSchema,
  listCompanyInfoVersionsQuerySchema,
  companyInfoVersionsPageSchema,
} from './schemas/company-info.schema';
export type {
  UpsertCompanyInfoInput,
  CompanyInfoResponse,
  CompanyInfoVersionResponse,
  ListCompanyInfoVersionsQuery,
  CompanyInfoVersionsPage,
} from './schemas/company-info.schema';

export {
  createBrandSchema,
  renameBrandSchema,
  brandResponseSchema,
  brandIdParamSchema,
} from './schemas/brand.schema';
export type {
  CreateBrandInput,
  RenameBrandInput,
  BrandResponse,
  BrandIdParam,
} from './schemas/brand.schema';

export {
  dosDontsTypeSchema,
  dosDontsCategorySchema,
  createDosDontsEntrySchema,
  updateDosDontsEntrySchema,
  dosDontsEntryResponseSchema,
  dosDontsListQuerySchema,
  dosDontsListResponseSchema,
  upsertBrandMetadataSchema,
  brandMetadataResponseSchema,
  guidelineSearchQuerySchema,
  guidelineSearchSectionSchema,
  guidelineSearchItemSchema,
  guidelineSearchGroupSchema,
  guidelineSearchResponseSchema,
} from './schemas/brand-guidelines.schema';
export type {
  CreateDosDontsEntryBody,
  UpdateDosDontsEntryBody,
  DosDontsEntryResponse,
  DosDontsListQuery,
  DosDontsListResponse,
  UpsertBrandMetadataBody,
  BrandMetadataResponse,
  GuidelineSearchQuery,
  GuidelineSearchItemResponse,
  GuidelineSearchGroupResponse,
  GuidelineSearchResponse,
} from './schemas/brand-guidelines.schema';

export {
  upsertBrandVoiceSchema,
  brandVoiceResponseSchema,
  brandIdGuidelineParamSchema,
} from './schemas/brand-voice.schema';
export type {
  UpsertBrandVoiceInput,
  BrandVoiceResponse,
  BrandIdGuidelineParam,
} from './schemas/brand-voice.schema';

export {
  upsertVisualIdentitySchema,
  visualIdentityResponseSchema,
} from './schemas/visual-identity.schema';
export type {
  UpsertVisualIdentityInput,
  VisualIdentityResponse,
} from './schemas/visual-identity.schema';

export {
  brandGuidelinesSnapshotSchema,
  brandGuidelinesVersionResponseSchema,
  listBrandGuidelinesVersionsQuerySchema,
  brandGuidelinesVersionsPageSchema,
  changeNoteQuerySchema,
} from './schemas/brand-guidelines-version.schema';
export type {
  BrandGuidelinesVersionResponse,
  ListBrandGuidelinesVersionsQuery,
  BrandGuidelinesVersionsPage,
  ChangeNoteQuery,
} from './schemas/brand-guidelines-version.schema';

export {
  agentAuditLogResponseSchema,
  agentAuditLogListResponseSchema,
  listAgentAuditLogQuerySchema,
} from './schemas/agent-audit-log.schema';
export type {
  AgentAuditLogResponse,
  AgentAuditLogListResponse,
  ListAgentAuditLogQuery,
} from './schemas/agent-audit-log.schema';
