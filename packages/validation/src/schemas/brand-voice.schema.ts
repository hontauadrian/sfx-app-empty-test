import { z } from 'zod';
import '../openapi';

export const BRAND_VOICE_TONE_MAX_LENGTH = 4000;
export const BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH = 200;
export const BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH = 1000;
export const BRAND_VOICE_AUDIENCE_MAX_LENGTH = 120;
export const BRAND_VOICE_PHRASE_MAX_LENGTH = 500;
export const BRAND_VOICE_VOCAB_MAX_ITEMS = 200;
export const BRAND_VOICE_PILLARS_MAX_ITEMS = 50;
export const BRAND_VOICE_RULES_MAX_ITEMS = 100;
export const BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS = 50;
export const BRAND_VOICE_PHRASES_MAX_ITEMS = 100;

function caseInsensitiveUnique(items: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function shortListItem(): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: 'List item is required' })
    .max(BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH, {
      message: `List item must be at most ${BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH} characters`,
    });
}

function longListItem(): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: 'List item is required' })
    .max(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH, {
      message: `List item must be at most ${BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH} characters`,
    });
}

function phraseListItem(): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: 'List item is required' })
    .max(BRAND_VOICE_PHRASE_MAX_LENGTH, {
      message: `List item must be at most ${BRAND_VOICE_PHRASE_MAX_LENGTH} characters`,
    });
}

const audienceRuleObject = z.object({
  audience: z
    .string()
    .trim()
    .min(1, { message: 'Audience is required' })
    .max(BRAND_VOICE_AUDIENCE_MAX_LENGTH, {
      message: `Audience must be at most ${BRAND_VOICE_AUDIENCE_MAX_LENGTH} characters`,
    }),
  rule: z
    .string()
    .trim()
    .min(1, { message: 'Rule is required' })
    .max(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH, {
      message: `Rule must be at most ${BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH} characters`,
    }),
});

const preferredVocabularyField = z
  .array(shortListItem())
  .max(BRAND_VOICE_VOCAB_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_VOCAB_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

const restrictedVocabularyField = z
  .array(shortListItem())
  .max(BRAND_VOICE_VOCAB_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_VOCAB_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

const messagingPillarsField = z
  .array(shortListItem())
  .max(BRAND_VOICE_PILLARS_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_PILLARS_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

const writingStyleRulesField = z
  .array(longListItem())
  .max(BRAND_VOICE_RULES_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_RULES_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

const audienceRulesField = z
  .array(audienceRuleObject)
  .max(BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS} items`,
  })
  .default([])
  .refine(
    (items) => caseInsensitiveUnique(items.map((entry) => entry.audience)),
    { message: 'Audiences must be unique (case-insensitive)' },
  );

const approvedExamplePhrasesField = z
  .array(phraseListItem())
  .max(BRAND_VOICE_PHRASES_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_PHRASES_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

const rejectedExamplePhrasesField = z
  .array(phraseListItem())
  .max(BRAND_VOICE_PHRASES_MAX_ITEMS, {
    message: `At most ${BRAND_VOICE_PHRASES_MAX_ITEMS} items`,
  })
  .default([])
  .refine(caseInsensitiveUnique, {
    message: 'Items must be unique (case-insensitive)',
  });

export const brandVoiceWriteSchema = z
  .object({
    toneOfVoice: z
      .string()
      .trim()
      .max(BRAND_VOICE_TONE_MAX_LENGTH, {
        message: `Tone of voice must be at most ${BRAND_VOICE_TONE_MAX_LENGTH} characters`,
      })
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .optional()
      .default(null)
      .openapi({
        example: 'Warm, direct, plain-spoken.',
        description: `Tone of voice (0..${BRAND_VOICE_TONE_MAX_LENGTH} chars). Empty string normalises to null.`,
      }),
    preferredVocabulary: preferredVocabularyField.openapi({
      example: ['craft', 'trust'],
      description: `Preferred vocabulary (max ${BRAND_VOICE_VOCAB_MAX_ITEMS} items; case-insensitive unique).`,
    }),
    restrictedVocabulary: restrictedVocabularyField.openapi({
      example: ['utilize', 'leverage'],
      description: `Restricted vocabulary (max ${BRAND_VOICE_VOCAB_MAX_ITEMS} items; case-insensitive unique).`,
    }),
    messagingPillars: messagingPillarsField.openapi({
      example: ['Trust', 'Craft'],
      description: `Messaging pillars (max ${BRAND_VOICE_PILLARS_MAX_ITEMS} items).`,
    }),
    writingStyleRules: writingStyleRulesField.openapi({
      example: ['Use active voice.'],
      description: `Writing style rules (max ${BRAND_VOICE_RULES_MAX_ITEMS} items).`,
    }),
    audienceRules: audienceRulesField.openapi({
      example: [{ audience: 'Gen Z', rule: 'Speak peer-to-peer.' }],
      description: `Audience-specific rules (max ${BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS} items).`,
    }),
    approvedExamplePhrases: approvedExamplePhrasesField.openapi({
      example: ['We build with care.'],
      description: `Approved example phrases (max ${BRAND_VOICE_PHRASES_MAX_ITEMS} items).`,
    }),
    rejectedExamplePhrases: rejectedExamplePhrasesField.openapi({
      example: ['Synergize value-add.'],
      description: `Rejected example phrases (max ${BRAND_VOICE_PHRASES_MAX_ITEMS} items).`,
    }),
  })
  .openapi({ description: 'Body for upserting a brand voice' });

export type BrandVoiceWriteInput = z.infer<typeof brandVoiceWriteSchema>;

const audienceRuleResponse = z
  .object({
    audience: z.string(),
    rule: z.string(),
  })
  .openapi({ description: 'Audience-specific rule' });

export const brandVoiceSchema = z
  .object({
    brandProfileId: z
      .string()
      .openapi({ example: 'cuid12345', description: 'Owning brand identifier' }),
    toneOfVoice: z.string().nullable().openapi({
      example: 'Warm, direct, plain-spoken.',
      description: 'Tone of voice or null',
    }),
    preferredVocabulary: z
      .array(z.string())
      .openapi({ example: ['craft'], description: 'Preferred vocabulary' }),
    restrictedVocabulary: z
      .array(z.string())
      .openapi({ example: ['utilize'], description: 'Restricted vocabulary' }),
    messagingPillars: z
      .array(z.string())
      .openapi({ example: ['Trust'], description: 'Messaging pillars' }),
    writingStyleRules: z
      .array(z.string())
      .openapi({ example: ['Use active voice.'], description: 'Writing style rules' }),
    audienceRules: z
      .array(audienceRuleResponse)
      .openapi({ description: 'Audience-specific rules' }),
    approvedExamplePhrases: z
      .array(z.string())
      .openapi({ example: ['We build with care.'], description: 'Approved example phrases' }),
    rejectedExamplePhrases: z
      .array(z.string())
      .openapi({ example: ['Synergize value-add.'], description: 'Rejected example phrases' }),
    createdAt: z
      .string()
      .nullable()
      .openapi({
        example: '2026-05-15T10:00:00.000Z',
        description: 'Creation timestamp (ISO) or null when no row persisted yet',
      }),
    updatedAt: z
      .string()
      .nullable()
      .openapi({
        example: '2026-05-15T10:00:00.000Z',
        description: 'Last-update timestamp (ISO) or null when no row persisted yet',
      }),
  })
  .openapi({ description: 'Brand voice resource' });

export type BrandVoiceShape = z.infer<typeof brandVoiceSchema>;
