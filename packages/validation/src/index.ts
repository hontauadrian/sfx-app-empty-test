// IMPORTANT: import `./openapi` first for the side-effect of extending Zod
// with `.openapi()` before any schema is defined downstream.
export { zodToOpenApi, getOpenApiSchemas } from './openapi';

export { paginationSchema } from './schemas/common.schema';
export type { PaginationInput } from './schemas/common.schema';
export { idParamSchema } from './schemas/common.schema';
export type { IdParamInput } from './schemas/common.schema';
