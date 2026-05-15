// IMPORTANT: import `./openapi` first for the side-effect of extending Zod
// with `.openapi()` before any schema is defined downstream.
export { zodToOpenApi, zodApiBody, getOpenApiSchemas } from './openapi';

export { paginationSchema } from './schemas/common.schema';
export type { PaginationInput } from './schemas/common.schema';
export { idParamSchema } from './schemas/common.schema';
export type { IdParamInput } from './schemas/common.schema';

export {
  BRAND_NAME_MIN_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  BRAND_DESCRIPTION_MAX_LENGTH,
  brandProfileWriteSchema,
  brandProfileSchema,
} from './schemas/brand-profile.schema';
export type {
  BrandProfileWriteInput,
  BrandProfileShape,
} from './schemas/brand-profile.schema';
