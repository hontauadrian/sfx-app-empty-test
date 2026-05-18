import { describe, expect, it } from 'vitest';
import {
  brandIdGuidelineParamSchema,
  brandVoiceResponseSchema,
  upsertBrandVoiceSchema,
} from '../brand-voice.schema';

describe('upsertBrandVoiceSchema', () => {
  it('accepts a minimal valid payload with only tone', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'Warm and expert' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tone).toBe('Warm and expert');
  });

  it('trims surrounding whitespace from tone', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: '  Bold  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tone).toBe('Bold');
  });

  it('rejects missing tone', () => {
    const r = upsertBrandVoiceSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects whitespace-only tone with the documented message', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Tone of voice is required')).toBe(true);
    }
  });

  it('rejects empty-string tone', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: '' });
    expect(r.success).toBe(false);
  });

  it('rejects oversize tone', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'x'.repeat(4001) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Tone must be 4000 characters or fewer'),
      ).toBe(true);
    }
  });

  it('rejects unknown body keys under .strict()', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'Bold', extra: 'nope' });
    expect(r.success).toBe(false);
  });

  it('accepts populated lists', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      preferredVocabulary: ['craft', 'partner'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Short sentences.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'Partner up.' }],
      rejectedExamples: [{ phrase: 'Cheap deal', reason: 'Negative.' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects messagingPillars with empty title', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      messagingPillars: [{ title: '', description: 'desc' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Pillar title is required')).toBe(true);
    }
  });

  it('rejects messagingPillars with empty description', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      messagingPillars: [{ title: 'Trust', description: '' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Pillar description is required'),
      ).toBe(true);
    }
  });

  it('rejects audienceRules with empty audience or rules', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      audienceRules: [{ audience: '', rules: '' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects approvedExamples with empty phrase', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      approvedExamples: [{ phrase: '' }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts rejectedExamples with null reason', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      rejectedExamples: [{ phrase: 'No', reason: null }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects preferredVocabulary at max+1 items', () => {
    const overflow = Array.from({ length: 257 }, (_, i) => `term-${i}`);
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'Bold', preferredVocabulary: overflow });
    expect(r.success).toBe(false);
  });

  it('rejects messagingPillars at max+1 items', () => {
    const overflow = Array.from({ length: 65 }, (_, i) => ({
      title: `t-${i}`,
      description: 'd',
    }));
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'Bold', messagingPillars: overflow });
    expect(r.success).toBe(false);
  });

  it('rejects empty preferredVocabulary items', () => {
    const r = upsertBrandVoiceSchema.safeParse({
      tone: 'Bold',
      preferredVocabulary: ['ok', ''],
    });
    expect(r.success).toBe(false);
  });

  it('writingStyleRules accepts null', () => {
    const r = upsertBrandVoiceSchema.safeParse({ tone: 'Bold', writingStyleRules: null });
    expect(r.success).toBe(true);
  });
});

describe('brandVoiceResponseSchema', () => {
  it('accepts a fully populated response with date fields', () => {
    const r = brandVoiceResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Short.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'Partner.' }],
      rejectedExamples: [{ phrase: 'No.', reason: null }],
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T01:00:00.000Z'),
      latestVersionId: 'clxbgv0001',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.brandId).toBe('clxbrand0001');
      expect(r.data.latestVersionId).toBe('clxbgv0001');
    }
  });

  it('accepts latestVersionId null when no version exists yet', () => {
    const r = brandVoiceResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      tone: 'Bold',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latestVersionId).toBeNull();
  });

  it('rejects response without brandId', () => {
    const r = brandVoiceResponseSchema.safeParse({
      tone: 'Bold',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejects response without latestVersionId', () => {
    const r = brandVoiceResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      tone: 'Bold',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });
});

describe('brandIdGuidelineParamSchema', () => {
  it('accepts a non-empty brandId', () => {
    const r = brandIdGuidelineParamSchema.safeParse({ brandId: 'clxbrand0001' });
    expect(r.success).toBe(true);
  });

  it('rejects empty brandId', () => {
    const r = brandIdGuidelineParamSchema.safeParse({ brandId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const r = brandIdGuidelineParamSchema.safeParse({ brandId: 'x', extra: 'y' });
    expect(r.success).toBe(false);
  });
});
