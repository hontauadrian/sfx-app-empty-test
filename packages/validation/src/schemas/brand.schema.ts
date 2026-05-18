import '../openapi';
import { z } from 'zod';

export const createBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(200, 'Name must be 200 characters or fewer')
      .openapi({ description: 'Brand display name', example: 'Acme Holdings' }),
  })
  .strict()
  .openapi({ description: 'Payload for creating a brand profile' });

export const renameBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(200, 'Name must be 200 characters or fewer')
      .openapi({ description: 'New brand display name', example: 'Acme Holdings' }),
  })
  .strict()
  .openapi({ description: 'Payload for renaming a brand profile' });

export const brandResponseSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .openapi({ description: 'Brand identifier', example: 'clxyzbrand0000000001' }),
    name: z
      .string()
      .min(1)
      .max(200)
      .openapi({ description: 'Brand display name', example: 'Acme Holdings' }),
    slug: z
      .string()
      .min(1)
      .max(220)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
      .openapi({ description: 'URL-safe slug (server-derived from name)', example: 'acme-holdings' }),
    ownerUserId: z
      .string()
      .min(1)
      .openapi({ description: 'Subject id of the creating admin', example: 'subject-admin' }),
    createdAt: z.date().openapi({ description: 'Record creation timestamp' }),
    updatedAt: z.date().openapi({ description: 'Record last-update timestamp' }),
    deletedAt: z
      .date()
      .nullable()
      .openapi({ description: 'Soft-delete timestamp; null when active' }),
  })
  .strict()
  .openapi({ description: 'Persisted brand profile' });

export const brandIdParamSchema = z
  .object({
    id: z.string().min(1, 'id is required'),
  })
  .strict();

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type RenameBrandInput = z.infer<typeof renameBrandSchema>;
export type BrandResponse = z.infer<typeof brandResponseSchema>;
export type BrandIdParam = z.infer<typeof brandIdParamSchema>;
