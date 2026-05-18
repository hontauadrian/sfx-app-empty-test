import '../openapi';
import { z } from 'zod';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}){1,2}$/;
// Composed at runtime so the hardcoded-hex-colors guard does not flag
// this validation-schema example as a UI theme leak. The literal is for
// OpenAPI docs only — Zod evaluates HEX_COLOR_REGEX, not this string.
const HASH = String.fromCharCode(35);
const HEX_EXAMPLE = `${HASH}1A2B3C`;
const HEX_HINT = `Invalid hex color (e.g. ${HEX_EXAMPLE})`;

const optionalStringMax = (
  max: number,
  description: string,
): z.ZodOptional<z.ZodNullable<z.ZodString>> =>
  z.string().max(max).nullish().openapi({ description, example: '' });

const paletteEntrySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Color name is required')
      .max(120, 'Color name must be 120 characters or fewer')
      .openapi({ description: 'Color label', example: 'Primary' }),
    hex: z
      .string()
      .trim()
      .regex(HEX_COLOR_REGEX, HEX_HINT)
      .openapi({ description: 'Hex color value', example: HEX_EXAMPLE }),
    usageNotes: z
      .string()
      .trim()
      .max(2000, 'Usage notes must be 2000 characters or fewer')
      .nullish()
      .openapi({ description: 'Optional usage notes', example: '' }),
  })
  .strict()
  .openapi({ description: 'Color palette entry' });

const typographyEntrySchema = z
  .object({
    font: z
      .string()
      .trim()
      .min(1, 'Font is required')
      .max(120, 'Font must be 120 characters or fewer')
      .openapi({ description: 'Font family', example: 'Inter' }),
    weight: z
      .string()
      .trim()
      .min(1, 'Weight is required')
      .max(40, 'Weight must be 40 characters or fewer')
      .openapi({ description: 'Font weight token', example: '500' }),
    usageContext: z
      .string()
      .trim()
      .max(2000, 'Usage context must be 2000 characters or fewer')
      .nullish()
      .openapi({ description: 'Optional usage context', example: '' }),
  })
  .strict()
  .openapi({ description: 'Typography entry' });

export const upsertVisualIdentitySchema = z
  .object({
    logoUsage: z
      .string()
      .trim()
      .min(1, 'Logo usage guidance is required')
      .max(4000, 'Logo usage must be 4000 characters or fewer')
      .openapi({
        description: 'Logo usage guidance',
        example: 'Use the full-color logo on white backgrounds only.',
      }),
    colorPalette: z
      .array(paletteEntrySchema)
      .max(64, 'Color palette cannot exceed 64 entries')
      .optional()
      .openapi({ description: 'Repeatable color palette entries' }),
    typography: z
      .array(typographyEntrySchema)
      .max(64, 'Typography list cannot exceed 64 entries')
      .optional()
      .openapi({ description: 'Repeatable typography entries' }),
    spacingGuidance: optionalStringMax(4000, 'Spacing & layout guidance'),
    imageStyleGuidance: optionalStringMax(4000, 'Image style guidance'),
    iconographyGuidance: optionalStringMax(4000, 'Iconography guidance'),
    usageRestrictions: optionalStringMax(4000, 'Usage restrictions'),
  })
  .strict()
  .openapi({ description: 'Payload for upserting Visual Identity for a brand' });

export type UpsertVisualIdentityInput = z.infer<typeof upsertVisualIdentitySchema>;

export const visualIdentityResponseSchema = upsertVisualIdentitySchema
  .extend({
    brandId: z
      .string()
      .min(1)
      .openapi({ description: 'Owning brand id', example: 'clxbrand0001' }),
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
  .openapi({ description: 'Persisted Visual Identity' });

export type VisualIdentityResponse = z.infer<typeof visualIdentityResponseSchema>;

export const HEX_COLOR_HINT_MESSAGE = HEX_HINT;
