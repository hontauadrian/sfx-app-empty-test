import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@sfx/shared';
import '../openapi';

export const paginationSchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .openapi({ description: '1-based page index', example: 1 }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE)
      .openapi({ description: 'Items per page', example: DEFAULT_PAGE_SIZE }),
  })
  .openapi({ description: 'Pagination query parameters' });

export type PaginationInput = z.infer<typeof paginationSchema>;

export const idParamSchema = z
  .object({
    id: z
      .string()
      .min(1, 'ID is required')
      .openapi({ description: 'Unique resource identifier', example: 'cuid12345' }),
  })
  .openapi({ description: 'URL path parameter for a resource identifier' });

export type IdParamInput = z.infer<typeof idParamSchema>;
