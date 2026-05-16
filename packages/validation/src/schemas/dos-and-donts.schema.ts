import { z } from 'zod';
import '../openapi';

export const DOS_AND_DONT_TYPE_VALUES = ['do', 'dont'] as const;
export const DOS_AND_DONT_CATEGORY_VALUES = [
  'tone',
  'vocabulary',
  'visuals',
  'legal',
  'campaign-messaging',
] as const;

export const DOS_AND_DONT_TITLE_MAX_LENGTH = 200;
export const DOS_AND_DONT_BODY_MAX_LENGTH = 4000;

export type DosAndDontType = (typeof DOS_AND_DONT_TYPE_VALUES)[number];
export type DosAndDontCategory = (typeof DOS_AND_DONT_CATEGORY_VALUES)[number];

const typeField = z.enum(DOS_AND_DONT_TYPE_VALUES).openapi({
  example: 'do',
  description: `Entry type. One of: ${DOS_AND_DONT_TYPE_VALUES.join(', ')}.`,
});

const categoryField = z.enum(DOS_AND_DONT_CATEGORY_VALUES).openapi({
  example: 'tone',
  description: `Entry category. One of: ${DOS_AND_DONT_CATEGORY_VALUES.join(', ')}.`,
});

const titleField = z
  .string()
  .trim()
  .min(1, { message: 'Title is required' })
  .max(DOS_AND_DONT_TITLE_MAX_LENGTH, {
    message: `Title must be at most ${DOS_AND_DONT_TITLE_MAX_LENGTH} characters`,
  })
  .openapi({
    example: 'Use active voice',
    description: `Short title (1..${DOS_AND_DONT_TITLE_MAX_LENGTH} chars, trimmed).`,
  });

const bodyField = z
  .string()
  .trim()
  .min(1, { message: 'Body is required' })
  .max(DOS_AND_DONT_BODY_MAX_LENGTH, {
    message: `Body must be at most ${DOS_AND_DONT_BODY_MAX_LENGTH} characters`,
  })
  .openapi({
    example: 'Prefer we ship over products are shipped.',
    description: `Full body (1..${DOS_AND_DONT_BODY_MAX_LENGTH} chars, trimmed).`,
  });

const suggestedCorrectionField = z
  .string()
  .trim()
  .max(DOS_AND_DONT_BODY_MAX_LENGTH, {
    message: `Suggested correction must be at most ${DOS_AND_DONT_BODY_MAX_LENGTH} characters`,
  })
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .openapi({
    example: 'Rewrite passive verbs as active.',
    description: `Optional suggested correction (0..${DOS_AND_DONT_BODY_MAX_LENGTH} chars). Empty string normalises to null.`,
  });

export const dosAndDontWriteSchema = z
  .object({
    type: typeField,
    category: categoryField,
    title: titleField,
    body: bodyField,
    suggestedCorrection: suggestedCorrectionField,
  })
  .openapi({ description: 'Body for creating or updating a dos-and-donts entry' });

export type DosAndDontWriteInput = z.infer<typeof dosAndDontWriteSchema>;

export const dosAndDontSchema = z
  .object({
    id: z
      .string()
      .openapi({ example: 'cuid67890', description: 'Dos-and-donts entry identifier' }),
    brandId: z
      .string()
      .openapi({ example: 'cuid12345', description: 'Owning brand identifier' }),
    type: z
      .enum(DOS_AND_DONT_TYPE_VALUES)
      .openapi({ example: 'do', description: 'Entry type' }),
    category: z
      .enum(DOS_AND_DONT_CATEGORY_VALUES)
      .openapi({ example: 'tone', description: 'Entry category' }),
    title: z.string().openapi({ example: 'Use active voice' }),
    body: z.string().openapi({ example: 'Prefer active over passive voice.' }),
    suggestedCorrection: z
      .string()
      .nullable()
      .openapi({
        example: 'Rewrite passive verbs as active.',
        description: 'Optional suggested correction or null',
      }),
    createdAt: z
      .string()
      .openapi({ example: '2026-05-15T10:00:00.000Z', description: 'ISO timestamp' }),
    updatedAt: z
      .string()
      .openapi({ example: '2026-05-15T10:00:00.000Z', description: 'ISO timestamp' }),
  })
  .openapi({ description: 'Dos-and-donts entry resource' });

export type DosAndDontShape = z.infer<typeof dosAndDontSchema>;

export const dosAndDontListQuerySchema = z
  .object({
    category: z
      .preprocess(
        (value) => (value === '' || value === undefined ? undefined : value),
        z.enum(DOS_AND_DONT_CATEGORY_VALUES).optional(),
      )
      .openapi({
        example: 'tone',
        description: 'Optional category filter. Empty string normalises to no filter.',
      }),
  })
  .openapi({ description: 'Query parameters for listing dos-and-donts entries' });

export type DosAndDontListQueryInput = z.infer<typeof dosAndDontListQuerySchema>;
