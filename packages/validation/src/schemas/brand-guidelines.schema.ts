import '../openapi';
import { z } from 'zod';
import {
  DOS_DONTS_CATEGORIES,
  DOS_DONTS_TYPES,
  GUIDELINE_SEARCH_SECTIONS,
} from '@sfx/domain';

// ---------------------------------------------------------------------------
// Dos & Don'ts
// ---------------------------------------------------------------------------

export const dosDontsTypeSchema = z
  .enum(DOS_DONTS_TYPES)
  .openapi({ description: 'D&D entry type', example: 'do' });

export const dosDontsCategorySchema = z
  .enum(DOS_DONTS_CATEGORIES)
  .openapi({
    description: 'D&D entry category (extensible)',
    example: 'tone',
  });

export const createDosDontsEntrySchema = z
  .object({
    type: dosDontsTypeSchema,
    category: dosDontsCategorySchema,
    ruleText: z
      .string()
      .trim()
      .min(1, 'Rule text is required')
      .max(4000, 'Rule text must be 4000 characters or fewer')
      .openapi({
        description: 'Brand rule statement (1-4000 chars)',
        example: 'Always use the official wordmark in marketing.',
      }),
    exampleText: z
      .string()
      .trim()
      .max(4000, 'Example must be 4000 characters or fewer')
      .nullish()
      .openapi({
        description: 'Optional contextual example illustrating the rule',
        example: 'e.g. social header banners',
      }),
  })
  .strict()
  .openapi({ description: 'Payload for creating a D&D entry' });

export const updateDosDontsEntrySchema = z
  .object({
    type: dosDontsTypeSchema.optional(),
    category: dosDontsCategorySchema.optional(),
    ruleText: z
      .string()
      .trim()
      .min(1, 'Rule text is required')
      .max(4000, 'Rule text must be 4000 characters or fewer')
      .optional()
      .openapi({ description: 'Updated rule statement', example: 'New rule' }),
    exampleText: z
      .string()
      .trim()
      .max(4000, 'Example must be 4000 characters or fewer')
      .nullish()
      .openapi({
        description: 'Updated contextual example; null clears it',
        example: 'updated example',
      }),
  })
  .strict()
  .openapi({ description: 'Partial-update payload for a D&D entry' });

export const dosDontsEntryResponseSchema = z
  .object({
    id: z.string().min(1).openapi({ description: 'Entry id', example: 'clxdd0001' }),
    brandId: z
      .string()
      .min(1)
      .openapi({ description: 'Owning brand id', example: 'clxbrand0001' }),
    type: dosDontsTypeSchema,
    category: dosDontsCategorySchema,
    ruleText: z
      .string()
      .min(1)
      .openapi({ description: 'Brand rule statement', example: 'Use official wordmark.' }),
    exampleText: z
      .string()
      .nullable()
      .openapi({ description: 'Optional contextual example; null when omitted', example: null }),
    createdAt: z.date().openapi({ description: 'Record creation timestamp' }),
    updatedAt: z.date().openapi({ description: 'Record last-update timestamp' }),
  })
  .strict()
  .openapi({ description: 'Persisted D&D entry' });

export const dosDontsListQuerySchema = z
  .object({
    type: dosDontsTypeSchema.optional(),
    category: dosDontsCategorySchema.optional(),
  })
  .strict()
  .openapi({ description: 'Optional filters for the D&D list endpoint' });

export const dosDontsListResponseSchema = z
  .object({
    items: z
      .array(dosDontsEntryResponseSchema)
      .openapi({ description: 'Active D&D entries newest-first' }),
    latestVersionId: z
      .string()
      .min(1)
      .nullable()
      .openapi({
        description:
          'Id of the latest BrandGuidelinesVersion row for the brand; null until a version exists',
        example: 'clxbgv0001',
      }),
  })
  .strict()
  .openapi({ description: 'List wrapper for the D&D collection' });

// ---------------------------------------------------------------------------
// Brand metadata
// ---------------------------------------------------------------------------

export const upsertBrandMetadataSchema = z
  .object({
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Tag must contain at least one character')
          .max(80, 'Tags must be 80 characters or fewer'),
      )
      .max(64, 'At most 64 tags')
      .optional()
      .openapi({
        description:
          'Free-form metadata tags. Omit to keep existing; pass [] to clear.',
        example: ['campaign-spring', 'EN'],
      }),
  })
  .strict()
  .openapi({ description: 'Upsert payload for brand metadata' });

export const brandMetadataResponseSchema = z
  .object({
    brandId: z.string().min(1).openapi({ description: 'Owning brand id', example: 'clxbrand0001' }),
    ownerUserId: z
      .string()
      .min(1)
      .openapi({ description: 'Subject id of the brand owner', example: 'subject-admin' }),
    lastUpdatedAt: z.date().openapi({ description: 'Timestamp of the last admin save' }),
    lastUpdatedByUserId: z
      .string()
      .min(1)
      .openapi({ description: 'Subject id of the admin that last PUT metadata', example: 'subject-admin' }),
    tags: z
      .array(z.string())
      .openapi({ description: 'Metadata tags (free-form)', example: ['campaign-spring'] }),
    createdAt: z.date().openapi({ description: 'Record creation timestamp' }),
    updatedAt: z.date().openapi({ description: 'Record last-update timestamp' }),
    latestVersionId: z
      .string()
      .min(1)
      .nullable()
      .openapi({
        description:
          'Id of the latest BrandGuidelinesVersion row for the brand; null until a version exists',
        example: 'clxbgv0001',
      }),
  })
  .strict()
  .openapi({ description: 'Persisted brand metadata singleton' });

// ---------------------------------------------------------------------------
// Guideline search
// ---------------------------------------------------------------------------

export const guidelineSearchQuerySchema = z
  .object({
    q: z
      .string()
      .max(200, 'Query must be 200 characters or fewer')
      .optional()
      .openapi({ description: 'Search query (max 200 chars)', example: 'wordmark' }),
  })
  .strict()
  .openapi({ description: 'Guideline search query string' });

export const guidelineSearchSectionSchema = z
  .enum(GUIDELINE_SEARCH_SECTIONS)
  .openapi({ description: 'Source section identifier', example: 'dos-and-donts' });

export const guidelineSearchItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .openapi({ description: 'Source row id where applicable', example: 'clxdd0001' }),
    sectionTitleKey: z
      .string()
      .min(1)
      .openapi({
        description: 'Translation key for the section heading',
        example: 'admin.brandGuidelines.dosAndDonts.sectionTitle',
      }),
    matchedFieldKey: z
      .string()
      .min(1)
      .openapi({
        description: 'Translation key for the matched field label',
        example: 'admin.brandGuidelines.dosAndDonts.fields.ruleText.label',
      }),
    fragment: z
      .string()
      .max(200)
      .openapi({
        description: 'Truncated contextual snippet around the hit (≤200 chars)',
        example: 'Always use the official wordmark in marketing.',
      }),
    href: z
      .string()
      .min(1)
      .openapi({
        description: 'Deep-link href into the active brand subsection',
        example: '/admin/brand-guidelines/clxbrand0001?section=dosAndDonts#entry-clxdd0001',
      }),
  })
  .strict()
  .openapi({ description: 'Single guideline search hit' });

export const guidelineSearchGroupSchema = z
  .object({
    section: guidelineSearchSectionSchema,
    items: z
      .array(guidelineSearchItemSchema)
      .openapi({ description: 'Hits within this section' }),
  })
  .strict()
  .openapi({ description: 'Search hits grouped by source section' });

export const guidelineSearchResponseSchema = z
  .object({
    query: z
      .string()
      .openapi({ description: 'Echoed query (trimmed)', example: 'wordmark' }),
    brandId: z
      .string()
      .min(1)
      .openapi({ description: 'Brand the search was scoped to', example: 'clxbrand0001' }),
    groups: z
      .array(guidelineSearchGroupSchema)
      .openapi({ description: 'Result groups (one per matched section)' }),
  })
  .strict()
  .openapi({ description: 'Guideline search response envelope' });

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateDosDontsEntryBody = z.infer<typeof createDosDontsEntrySchema>;
export type UpdateDosDontsEntryBody = z.infer<typeof updateDosDontsEntrySchema>;
export type DosDontsEntryResponse = z.infer<typeof dosDontsEntryResponseSchema>;
export type DosDontsListQuery = z.infer<typeof dosDontsListQuerySchema>;
export type DosDontsListResponse = z.infer<typeof dosDontsListResponseSchema>;

export type UpsertBrandMetadataBody = z.infer<typeof upsertBrandMetadataSchema>;
export type BrandMetadataResponse = z.infer<typeof brandMetadataResponseSchema>;

export type GuidelineSearchQuery = z.infer<typeof guidelineSearchQuerySchema>;
export type GuidelineSearchItemResponse = z.infer<typeof guidelineSearchItemSchema>;
export type GuidelineSearchGroupResponse = z.infer<typeof guidelineSearchGroupSchema>;
export type GuidelineSearchResponse = z.infer<typeof guidelineSearchResponseSchema>;
