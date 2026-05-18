import '../openapi';
import { z } from 'zod';

const optionalStringMax = (
  max: number,
  description: string,
): z.ZodOptional<z.ZodNullable<z.ZodString>> =>
  z.string().max(max).nullish().openapi({ description, example: '' });

export const upsertCompanyInfoSchema = z
  .object({
    legalName: z
      .string()
      .min(1, 'Legal name is required')
      .max(200, 'Legal name must be 200 characters or fewer')
      .openapi({ description: 'Registered legal name', example: 'Acme Holdings SRL' }),
    tradingName: optionalStringMax(200, 'Trading name'),
    email: z.string().email('Invalid email address').nullish().openapi({ description: 'Contact email address' }),
    phone: optionalStringMax(40, 'Contact phone number'),
    website: z
      .union([z.string().url('Invalid website URL'), z.literal('')])
      .nullish()
      .openapi({ description: 'Website URL (absolute URL or empty string)', example: 'https://example.com' }),
    addressLine1: optionalStringMax(200, 'Address line 1'),
    addressLine2: optionalStringMax(200, 'Address line 2'),
    city: optionalStringMax(100, 'City'),
    postalCode: optionalStringMax(40, 'Postal code'),
    country: optionalStringMax(56, 'Country (ISO 3166 country name)'),
    taxId: optionalStringMax(64, 'Tax identifier'),
    registrationNumber: optionalStringMax(64, 'Company registration number'),
    companyName: optionalStringMax(200, 'Company display name'),
    foundedYear: z
      .number()
      .int('Founded year must be an integer')
      .min(1800, 'Founded year must be 1800 or later')
      .max(2027, 'Founded year must be no later than 2027')
      .nullish()
      .openapi({ description: 'Year the company was founded', example: 1998 }),
    teamSize: z
      .number()
      .int('Team size must be an integer')
      .min(0, 'Team size must be 0 or greater')
      .max(1_000_000, 'Team size must be 1,000,000 or fewer')
      .nullish()
      .openapi({ description: 'Approximate headcount', example: 42 }),
    industry: optionalStringMax(120, 'Industry'),
    missionStatement: optionalStringMax(4000, 'Mission statement'),
    visionStatement: optionalStringMax(4000, 'Vision statement'),
    coreValues: z
      .array(
        z
          .string()
          .min(1, 'Core value cannot be empty')
          .max(200, 'Each core value must be 200 characters or fewer'),
      )
      .max(32, 'Core values list cannot exceed 32 items')
      .optional()
      .openapi({ description: 'Repeatable list of core values', example: ['Integrity', 'Craft'] }),
    certifications: z
      .array(
        z
          .string()
          .min(1, 'Certification cannot be empty')
          .max(200, 'Each certification must be 200 characters or fewer'),
      )
      .max(32, 'Certifications list cannot exceed 32 items')
      .optional()
      .openapi({ description: 'Repeatable list of certifications', example: ['ISO 9001', 'SOC 2'] }),
  })
  .strict()
  .openapi({ description: 'Payload for upserting the singleton company info record' });

export type UpsertCompanyInfoInput = z.infer<typeof upsertCompanyInfoSchema>;

// Trap: Zod silently drops `.refine()`/`.transform()` chained before a
// `.merge()`/`.extend()`. `upsertCompanyInfoSchema` currently has none —
// if a future change adds one, re-declare it on the extended schema.
export const companyInfoResponseSchema = upsertCompanyInfoSchema
  .extend({
    id: z
      .string()
      .min(1)
      .openapi({ description: 'Unique company info record identifier', example: 'clxyz1234567890' }),
    createdAt: z.date().openapi({ description: 'Record creation timestamp' }),
    updatedAt: z.date().openapi({ description: 'Record last-update timestamp' }),
  })
  .strict()
  .openapi({ description: 'Persisted company info record' });

export type CompanyInfoResponse = z.infer<typeof companyInfoResponseSchema>;

export const companyInfoVersionResponseSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .openapi({ description: 'Version identifier', example: 'clxyzversion0000000001' }),
    companyInfoId: z
      .string()
      .min(1)
      .openapi({
        description: 'Identifier of the CompanyInfo record this version belongs to',
        example: 'clxyz1234567890',
      }),
    snapshot: companyInfoResponseSchema.openapi({
      description: 'Full CompanyInfo snapshot at the time the version was created',
    }),
    editorUserId: z
      .string()
      .min(1)
      .openapi({
        description: 'Stable subject identifier of the user that saved this version',
        example: 'auth-user-abc',
      }),
    editorDisplayName: z
      .string()
      .min(1)
      .openapi({
        description: 'Human-readable display name of the editor (email or username)',
        example: 'admin@example.com',
      }),
    createdAt: z.date().openapi({ description: 'Version creation timestamp' }),
  })
  .strict()
  .openapi({ description: 'A single CompanyInfo version row' });

export type CompanyInfoVersionResponse = z.infer<typeof companyInfoVersionResponseSchema>;

export const listCompanyInfoVersionsQuerySchema = z
  .object({
    take: z.coerce
      .number()
      .int('take must be an integer')
      .min(1, 'take must be 1 or greater')
      .max(100, 'take must be 100 or fewer')
      .optional()
      .openapi({ description: 'Page size; default 50', example: 50 }),
    cursor: z
      .string()
      .min(1, 'cursor must be a non-empty string')
      .optional()
      .openapi({
        description: 'Opaque cursor — the id of the last version on the previous page',
      }),
  })
  .strict()
  .openapi({ description: 'Query parameters for listing CompanyInfo versions' });

export type ListCompanyInfoVersionsQuery = z.infer<typeof listCompanyInfoVersionsQuerySchema>;

export const companyInfoVersionsPageSchema = z
  .object({
    items: z
      .array(companyInfoVersionResponseSchema)
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
  .openapi({ description: 'Paginated list of CompanyInfo versions' });

export type CompanyInfoVersionsPage = z.infer<typeof companyInfoVersionsPageSchema>;
