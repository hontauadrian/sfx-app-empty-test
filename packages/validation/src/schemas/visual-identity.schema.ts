import { z } from 'zod';
import '../openapi';

export const VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH = 4000;
export const VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH = 120;
export const VISUAL_IDENTITY_LIST_MAX_ITEMS = 50;
export const VISUAL_IDENTITY_HEX_PATTERN = new RegExp(
  '^' + String.fromCharCode(35) + '(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
);

function trimmedLongText(): z.ZodString {
  return z
    .string()
    .trim()
    .max(VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH, {
      message: `Text must be at most ${VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH} characters`,
    });
}

function shortTrimmedText(): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: 'Value is required' })
    .max(VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH, {
      message: `Value must be at most ${VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH} characters`,
    });
}

function nullableLongText(): z.ZodType<string | null, z.ZodTypeDef, unknown> {
  return trimmedLongText()
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null) as z.ZodType<string | null, z.ZodTypeDef, unknown>;
}

function nullableShortText(): z.ZodType<string | null, z.ZodTypeDef, unknown> {
  return z
    .string()
    .trim()
    .max(VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH, {
      message: `Value must be at most ${VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH} characters`,
    })
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null) as z.ZodType<
    string | null,
    z.ZodTypeDef,
    unknown
  >;
}

const colourPaletteEntrySchema = z.object({
  name: shortTrimmedText().openapi({
    example: 'Primary',
    description: 'Colour palette entry name',
  }),
  hex: z
    .string()
    .trim()
    .regex(VISUAL_IDENTITY_HEX_PATTERN, {
      message: 'Hex must match #RGB or #RRGGBB',
    })
    .openapi({
      description:
        'Hex value (#RGB or #RRGGBB, case-insensitive). User-provided runtime value.',
    }),
  usage: nullableLongText().openapi({
    example: 'Main brand colour.',
    description: 'Optional usage note',
  }),
});

const typographyRuleSchema = z.object({
  role: shortTrimmedText().openapi({
    example: 'Display',
    description: 'Typography role identifier',
  }),
  family: shortTrimmedText().openapi({
    example: 'Inter',
    description: 'Font family',
  }),
  weight: nullableShortText().openapi({
    example: '700',
    description: 'Optional font weight',
  }),
  size: nullableShortText().openapi({
    example: '48px',
    description: 'Optional font size',
  }),
  notes: nullableLongText().openapi({
    example: 'Hero headings.',
    description: 'Optional free-form notes',
  }),
});

const colourPaletteField = z
  .array(colourPaletteEntrySchema)
  .max(VISUAL_IDENTITY_LIST_MAX_ITEMS, {
    message: `At most ${VISUAL_IDENTITY_LIST_MAX_ITEMS} colour palette entries`,
  })
  .default([])
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((entry, index) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'name'],
          message: 'Duplicate colour palette name (case-insensitive)',
        });
      }
      seen.add(key);
    });
  });

const typographyRulesField = z
  .array(typographyRuleSchema)
  .max(VISUAL_IDENTITY_LIST_MAX_ITEMS, {
    message: `At most ${VISUAL_IDENTITY_LIST_MAX_ITEMS} typography rules`,
  })
  .default([])
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((entry, index) => {
      const key = entry.role.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'role'],
          message: 'Duplicate typography role (case-insensitive)',
        });
      }
      seen.add(key);
    });
  });

export const visualIdentityWriteSchema = z
  .object({
    logoUsageRules: nullableLongText().openapi({
      example: 'Maintain clear space equal to the x-height of the logo on all sides.',
      description: `Logo usage rules (0..${VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH} chars). Empty string normalises to null.`,
    }),
    colourPalette: colourPaletteField.openapi({
      description: `Colour palette entries (max ${VISUAL_IDENTITY_LIST_MAX_ITEMS}; names case-insensitive unique).`,
    }),
    typographyRules: typographyRulesField.openapi({
      description: `Typography rules (max ${VISUAL_IDENTITY_LIST_MAX_ITEMS}; roles case-insensitive unique).`,
    }),
    spacingLayoutGuidance: nullableLongText().openapi({
      example: 'Use an 8px baseline grid.',
      description: 'Spacing / layout guidance.',
    }),
    imageStyleGuidance: nullableLongText().openapi({
      example: 'Natural light photography with warm tones.',
      description: 'Image style guidance.',
    }),
    iconographyGuidance: nullableLongText().openapi({
      example: '1.5px stroke, rounded corners.',
      description: 'Iconography guidance.',
    }),
    usageRestrictions: nullableLongText().openapi({
      example: 'Never recolour the logo.',
      description: 'Usage restrictions.',
    }),
  })
  .openapi({ description: 'Body for upserting a brand visual identity' });

export type VisualIdentityWriteInput = z.infer<typeof visualIdentityWriteSchema>;

const colourPaletteEntryResponseSchema = z
  .object({
    name: z.string(),
    hex: z.string(),
    usage: z.string().nullable(),
  })
  .openapi({ description: 'Colour palette entry' });

const typographyRuleResponseSchema = z
  .object({
    role: z.string(),
    family: z.string(),
    weight: z.string().nullable(),
    size: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .openapi({ description: 'Typography rule entry' });

export const visualIdentitySchema = z
  .object({
    id: z.string().openapi({
      example: 'vi-cuid',
      description: 'Visual identity row id (empty when no row yet)',
    }),
    brandId: z
      .string()
      .openapi({ example: 'cuid12345', description: 'Owning brand identifier' }),
    logoUsageRules: z.string().nullable().openapi({
      example: 'Maintain clear space.',
      description: 'Logo usage rules or null',
    }),
    colourPalette: z
      .array(colourPaletteEntryResponseSchema)
      .openapi({ description: 'Colour palette' }),
    typographyRules: z
      .array(typographyRuleResponseSchema)
      .openapi({ description: 'Typography rules' }),
    spacingLayoutGuidance: z.string().nullable(),
    imageStyleGuidance: z.string().nullable(),
    iconographyGuidance: z.string().nullable(),
    usageRestrictions: z.string().nullable(),
    createdAt: z.string().openapi({
      example: '2026-05-15T10:00:00.000Z',
      description: 'Creation timestamp (ISO)',
    }),
    updatedAt: z.string().openapi({
      example: '2026-05-15T10:00:00.000Z',
      description: 'Last update timestamp (ISO)',
    }),
  })
  .openapi({ description: 'Brand visual identity resource' });

export type VisualIdentityShape = z.infer<typeof visualIdentitySchema>;
export type VisualIdentityColourPaletteEntry = z.infer<
  typeof colourPaletteEntryResponseSchema
>;
export type VisualIdentityTypographyRule = z.infer<typeof typographyRuleResponseSchema>;
