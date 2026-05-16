import { describe, expect, it } from 'vitest';
import {
  BRAND_VOICE_AUDIENCE_MAX_LENGTH,
  BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS,
  BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH,
  BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH,
  BRAND_VOICE_PHRASES_MAX_ITEMS,
  BRAND_VOICE_PHRASE_MAX_LENGTH,
  BRAND_VOICE_PILLARS_MAX_ITEMS,
  BRAND_VOICE_RULES_MAX_ITEMS,
  BRAND_VOICE_TONE_MAX_LENGTH,
  BRAND_VOICE_VOCAB_MAX_ITEMS,
  brandVoiceSchema,
  brandVoiceWriteSchema,
} from '../brand-voice.schema';

describe('brandVoiceWriteSchema', () => {
  it('accepts an empty body with all defaults', () => {
    const result = brandVoiceWriteSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toneOfVoice).toBeNull();
      expect(result.data.preferredVocabulary).toEqual([]);
      expect(result.data.restrictedVocabulary).toEqual([]);
      expect(result.data.messagingPillars).toEqual([]);
      expect(result.data.writingStyleRules).toEqual([]);
      expect(result.data.audienceRules).toEqual([]);
      expect(result.data.approvedExamplePhrases).toEqual([]);
      expect(result.data.rejectedExamplePhrases).toEqual([]);
    }
  });

  it('trims whitespace and normalises empty toneOfVoice to null', () => {
    const result = brandVoiceWriteSchema.safeParse({ toneOfVoice: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toneOfVoice).toBeNull();
  });

  it('accepts toneOfVoice at maximum length', () => {
    const result = brandVoiceWriteSchema.safeParse({
      toneOfVoice: 'a'.repeat(BRAND_VOICE_TONE_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it(`rejects toneOfVoice longer than ${BRAND_VOICE_TONE_MAX_LENGTH}`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      toneOfVoice: 'a'.repeat(BRAND_VOICE_TONE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('trims preferredVocabulary items', () => {
    const result = brandVoiceWriteSchema.safeParse({
      preferredVocabulary: ['  craft  '],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.preferredVocabulary).toEqual(['craft']);
  });

  it('rejects empty-after-trim list items', () => {
    const result = brandVoiceWriteSchema.safeParse({
      preferredVocabulary: ['  '],
    });
    expect(result.success).toBe(false);
  });

  it('rejects case-insensitive duplicate vocabulary entries', () => {
    const result = brandVoiceWriteSchema.safeParse({
      preferredVocabulary: ['foo', 'FOO'],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BRAND_VOICE_VOCAB_MAX_ITEMS} vocabulary items`, () => {
    const tooMany = Array.from(
      { length: BRAND_VOICE_VOCAB_MAX_ITEMS + 1 },
      (_, index) => `item-${index}`,
    );
    const result = brandVoiceWriteSchema.safeParse({ preferredVocabulary: tooMany });
    expect(result.success).toBe(false);
  });

  it('rejects an item longer than the short max length', () => {
    const result = brandVoiceWriteSchema.safeParse({
      preferredVocabulary: ['a'.repeat(BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH + 1)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate restrictedVocabulary case-insensitive', () => {
    const result = brandVoiceWriteSchema.safeParse({
      restrictedVocabulary: ['a', 'A'],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BRAND_VOICE_PILLARS_MAX_ITEMS} messaging pillars`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      messagingPillars: Array.from(
        { length: BRAND_VOICE_PILLARS_MAX_ITEMS + 1 },
        (_, index) => `pillar-${index}`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it(`accepts writing style rules up to ${BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH} chars`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      writingStyleRules: ['r'.repeat(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH)],
    });
    expect(result.success).toBe(true);
  });

  it(`rejects writing style rule longer than ${BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH}`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      writingStyleRules: ['r'.repeat(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH + 1)],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BRAND_VOICE_RULES_MAX_ITEMS} writing style rules`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      writingStyleRules: Array.from(
        { length: BRAND_VOICE_RULES_MAX_ITEMS + 1 },
        (_, index) => `rule ${index}`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it('accepts well-formed audienceRules', () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: [
        { audience: 'Gen Z', rule: 'Speak peer-to-peer.' },
        { audience: 'Enterprise', rule: 'Use formal register.' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects audienceRules with empty audience', () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: [{ audience: '   ', rule: 'something' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects audienceRules with empty rule', () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: [{ audience: 'a', rule: '   ' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate audience case-insensitive', () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: [
        { audience: 'a', rule: 'x' },
        { audience: 'A', rule: 'y' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects audience longer than ${BRAND_VOICE_AUDIENCE_MAX_LENGTH}`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: [
        { audience: 'a'.repeat(BRAND_VOICE_AUDIENCE_MAX_LENGTH + 1), rule: 'x' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS} audienceRules`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      audienceRules: Array.from(
        { length: BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS + 1 },
        (_, index) => ({ audience: `aud-${index}`, rule: 'x' }),
      ),
    });
    expect(result.success).toBe(false);
  });

  it(`rejects approvedExamplePhrases longer than ${BRAND_VOICE_PHRASE_MAX_LENGTH}`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      approvedExamplePhrases: ['a'.repeat(BRAND_VOICE_PHRASE_MAX_LENGTH + 1)],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${BRAND_VOICE_PHRASES_MAX_ITEMS} approved phrases`, () => {
    const result = brandVoiceWriteSchema.safeParse({
      approvedExamplePhrases: Array.from(
        { length: BRAND_VOICE_PHRASES_MAX_ITEMS + 1 },
        (_, index) => `phrase-${index}`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate approvedExamplePhrases case-insensitive', () => {
    const result = brandVoiceWriteSchema.safeParse({
      approvedExamplePhrases: ['Hello', 'hello'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate rejectedExamplePhrases case-insensitive', () => {
    const result = brandVoiceWriteSchema.safeParse({
      rejectedExamplePhrases: ['No', 'NO'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts toneOfVoice explicitly null', () => {
    const result = brandVoiceWriteSchema.safeParse({ toneOfVoice: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toneOfVoice).toBeNull();
  });

  it('accepts a fully populated payload', () => {
    const result = brandVoiceWriteSchema.safeParse({
      toneOfVoice: 'Warm and direct.',
      preferredVocabulary: ['craft', 'trust'],
      restrictedVocabulary: ['utilize'],
      messagingPillars: ['Trust', 'Craft'],
      writingStyleRules: ['Use active voice.'],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
      approvedExamplePhrases: ['We build with care.'],
      rejectedExamplePhrases: ['Synergize value-add.'],
    });
    expect(result.success).toBe(true);
  });
});

describe('brandVoiceSchema (response shape)', () => {
  it('accepts a response with the empty defaults and null timestamps', () => {
    const result = brandVoiceSchema.safeParse({
      brandProfileId: 'brand-1',
      toneOfVoice: null,
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated response', () => {
    const result = brandVoiceSchema.safeParse({
      brandProfileId: 'brand-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['utilize'],
      messagingPillars: ['Trust'],
      writingStyleRules: ['Use active voice.'],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
      approvedExamplePhrases: ['Hi'],
      rejectedExamplePhrases: ['Hey'],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when brandProfileId is missing', () => {
    const result = brandVoiceSchema.safeParse({
      toneOfVoice: null,
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(false);
  });
});
