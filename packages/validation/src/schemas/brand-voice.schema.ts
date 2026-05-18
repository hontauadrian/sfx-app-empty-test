import '../openapi';
import { z } from 'zod';

const optionalStringMax = (
  max: number,
  description: string,
): z.ZodOptional<z.ZodNullable<z.ZodString>> =>
  z.string().max(max).nullish().openapi({ description, example: '' });

const messagingPillarSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Pillar title is required')
      .max(120, 'Pillar title must be 120 characters or fewer')
      .openapi({ description: 'Messaging pillar title', example: 'Trust' }),
    description: z
      .string()
      .trim()
      .min(1, 'Pillar description is required')
      .max(4000, 'Pillar description must be 4000 characters or fewer')
      .openapi({ description: 'Messaging pillar description', example: 'We deliver on every promise.' }),
  })
  .strict()
  .openapi({ description: 'Messaging pillar (title + description)' });

const audienceRuleSchema = z
  .object({
    audience: z
      .string()
      .trim()
      .min(1, 'Audience is required')
      .max(200, 'Audience must be 200 characters or fewer'),
    rules: z
      .string()
      .trim()
      .min(1, 'Audience rules are required')
      .max(4000, 'Audience rules must be 4000 characters or fewer'),
  })
  .strict()
  .openapi({ description: 'Audience-specific rule block' });

const approvedExampleSchema = z
  .object({
    phrase: z
      .string()
      .trim()
      .min(1, 'Phrase is required')
      .max(2000, 'Phrase must be 2000 characters or fewer'),
  })
  .strict()
  .openapi({ description: 'Approved example phrase' });

const rejectedExampleSchema = z
  .object({
    phrase: z
      .string()
      .trim()
      .min(1, 'Phrase is required')
      .max(2000, 'Phrase must be 2000 characters or fewer'),
    reason: z
      .string()
      .trim()
      .max(2000, 'Reason must be 2000 characters or fewer')
      .nullish()
      .openapi({ description: 'Optional reason for rejection', example: '' }),
  })
  .strict()
  .openapi({ description: 'Rejected example phrase (optional reason)' });

export const upsertBrandVoiceSchema = z
  .object({
    tone: z
      .string()
      .trim()
      .min(1, 'Tone of voice is required')
      .max(4000, 'Tone must be 4000 characters or fewer')
      .openapi({
        description: 'Tone of voice',
        example: 'Warm, expert, never condescending',
      }),
    preferredVocabulary: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Term cannot be empty')
          .max(200, 'Each term must be 200 characters or fewer'),
      )
      .max(256, 'Preferred vocabulary cannot exceed 256 items')
      .optional()
      .openapi({ description: 'Preferred vocabulary list', example: ['craft', 'partner'] }),
    restrictedVocabulary: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Term cannot be empty')
          .max(200, 'Each term must be 200 characters or fewer'),
      )
      .max(256, 'Restricted vocabulary cannot exceed 256 items')
      .optional()
      .openapi({ description: 'Restricted vocabulary list', example: ['cheap', 'guarantee'] }),
    messagingPillars: z
      .array(messagingPillarSchema)
      .max(64, 'Messaging pillars cannot exceed 64 items')
      .optional()
      .openapi({ description: 'Repeatable messaging pillars' }),
    writingStyleRules: optionalStringMax(4000, 'Writing style rules'),
    audienceRules: z
      .array(audienceRuleSchema)
      .max(64, 'Audience rules cannot exceed 64 items')
      .optional()
      .openapi({ description: 'Per-audience rule rows' }),
    approvedExamples: z
      .array(approvedExampleSchema)
      .max(128, 'Approved examples cannot exceed 128 items')
      .optional()
      .openapi({ description: 'Approved example phrases' }),
    rejectedExamples: z
      .array(rejectedExampleSchema)
      .max(128, 'Rejected examples cannot exceed 128 items')
      .optional()
      .openapi({ description: 'Rejected example phrases' }),
  })
  .strict()
  .openapi({ description: 'Payload for upserting Brand Voice for a brand' });

export type UpsertBrandVoiceInput = z.infer<typeof upsertBrandVoiceSchema>;

export const brandVoiceResponseSchema = upsertBrandVoiceSchema
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
  .openapi({ description: 'Persisted Brand Voice' });

export type BrandVoiceResponse = z.infer<typeof brandVoiceResponseSchema>;

export const brandIdGuidelineParamSchema = z
  .object({
    brandId: z.string().min(1, 'brandId is required'),
  })
  .strict();

export type BrandIdGuidelineParam = z.infer<typeof brandIdGuidelineParamSchema>;
