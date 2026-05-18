import '../openapi';
import { z } from 'zod';
import { brandVoiceResponseSchema } from './brand-voice.schema';
import { visualIdentityResponseSchema } from './visual-identity.schema';
import {
  dosDontsEntryResponseSchema,
  brandMetadataResponseSchema,
} from './brand-guidelines.schema';

export const brandGuidelinesSnapshotSchema = z
  .object({
    voice: brandVoiceResponseSchema.nullable(),
    visual: visualIdentityResponseSchema.nullable(),
    dosAndDonts: z
      .array(dosDontsEntryResponseSchema)
      .openapi({ description: 'D&D entries newest-first' }),
    metadata: brandMetadataResponseSchema.nullable(),
  })
  .strict()
  .openapi({
    description: 'Full four-section guideline snapshot at the time the version was saved',
  });

export const brandGuidelinesVersionResponseSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .openapi({ description: 'Version identifier', example: 'clxbgv0001' }),
    brandId: z
      .string()
      .min(1)
      .openapi({ description: 'Owning brand identifier', example: 'clxbrand0001' }),
    snapshot: brandGuidelinesSnapshotSchema,
    editorUserId: z
      .string()
      .min(1)
      .openapi({ description: 'Auth subject of the editor', example: 'auth-user-abc' }),
    editorDisplayName: z
      .string()
      .min(1)
      .openapi({ description: 'Editor display name (email or username)' }),
    changeNote: z
      .string()
      .max(500)
      .nullable()
      .openapi({ description: 'Optional change note supplied by the editor' }),
    createdAt: z.date().openapi({ description: 'Version creation timestamp' }),
  })
  .strict()
  .openapi({ description: 'A single brand-guidelines version row' });

export type BrandGuidelinesVersionResponse = z.infer<typeof brandGuidelinesVersionResponseSchema>;

export const listBrandGuidelinesVersionsQuerySchema = z
  .object({
    take: z.coerce
      .number()
      .int('take must be an integer')
      .min(1, 'take must be at least 1')
      .max(100, 'take must be 100 or fewer')
      .optional()
      .openapi({ description: 'Page size; default 50', example: 50 }),
    cursor: z
      .string()
      .min(1, 'cursor must be a non-empty string')
      .optional()
      .openapi({
        description: 'Opaque cursor — id of the last version returned in the previous page',
      }),
    q: z
      .string()
      .min(1, 'q must be a non-empty string')
      .max(200, 'q must be 200 characters or fewer')
      .optional()
      .openapi({
        description:
          'Optional case-insensitive substring filter applied to editorName and changeNote',
        example: 'rebrand',
      }),
  })
  .strict()
  .openapi({ description: 'Query parameters for listing brand-guidelines versions' });

export type ListBrandGuidelinesVersionsQuery = z.infer<
  typeof listBrandGuidelinesVersionsQuerySchema
>;

export const brandGuidelinesVersionsPageSchema = z
  .object({
    items: z
      .array(brandGuidelinesVersionResponseSchema)
      .openapi({ description: 'Versions newest-first' }),
    nextCursor: z
      .string()
      .min(1)
      .nullable()
      .openapi({
        description: 'Cursor for the next page, or null when no further pages exist',
      }),
  })
  .strict()
  .openapi({ description: 'Paginated list of brand-guidelines versions' });

export type BrandGuidelinesVersionsPage = z.infer<typeof brandGuidelinesVersionsPageSchema>;

export const changeNoteQuerySchema = z
  .object({
    changeNote: z
      .string()
      .trim()
      .max(500, 'changeNote must be 500 characters or fewer')
      .optional()
      .openapi({
        description: 'Optional change note attached to the version row created by this mutation',
      }),
  })
  .strict()
  .openapi({
    description: 'Optional ?changeNote=... query parameter shared by every mutating guideline endpoint',
  });

export type ChangeNoteQuery = z.infer<typeof changeNoteQuerySchema>;
