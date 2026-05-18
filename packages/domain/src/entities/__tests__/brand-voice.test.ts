import { describe, expect, it } from 'vitest';
import type {
  BrandVoice,
  BrandVoiceAudienceRule,
  BrandVoiceApprovedExample,
  BrandVoiceMessagingPillar,
  BrandVoiceRejectedExample,
  UpsertBrandVoiceInput,
} from '../brand-voice';

describe('BrandVoice entity types', () => {
  it('accepts a fully populated value with every field present', () => {
    const sample: BrandVoice = {
      brandId: 'clxbrand0001',
      tone: 'Warm and expert',
      preferredVocabulary: ['craft', 'partner'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Use active voice.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'We partner closely.' }],
      rejectedExamples: [{ phrase: 'Cheap deal.', reason: 'Negative tone.' }],
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    };
    expect(sample.brandId).toBe('clxbrand0001');
    expect(sample.tone).toBe('Warm and expert');
    expect(sample.preferredVocabulary).toHaveLength(2);
    expect(sample.messagingPillars[0]?.title).toBe('Trust');
    expect(sample.rejectedExamples[0]?.reason).toBe('Negative tone.');
    expect(sample.createdAt).toBeInstanceOf(Date);
  });

  it('accepts a minimally populated value with empty list defaults', () => {
    const sample: BrandVoice = {
      brandId: 'clxbrand0002',
      tone: 'Neutral',
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: '',
      audienceRules: [],
      approvedExamples: [],
      rejectedExamples: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(sample.preferredVocabulary).toEqual([]);
    expect(sample.writingStyleRules).toBe('');
  });

  it('allows nullable reason on rejected example', () => {
    const example: BrandVoiceRejectedExample = { phrase: 'Bad', reason: null };
    expect(example.reason).toBeNull();
  });

  it('UpsertBrandVoiceInput accepts only the required tone', () => {
    const input: UpsertBrandVoiceInput = { tone: 'Authoritative' };
    expect(input.tone).toBe('Authoritative');
  });

  it('UpsertBrandVoiceInput accepts every optional list', () => {
    const pillar: BrandVoiceMessagingPillar = {
      title: 'Quality',
      description: 'We do not ship junk.',
    };
    const audience: BrandVoiceAudienceRule = {
      audience: 'Partners',
      rules: 'Be specific.',
    };
    const approved: BrandVoiceApprovedExample = { phrase: 'We partner.' };
    const input: UpsertBrandVoiceInput = {
      tone: 'Confident',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [pillar],
      writingStyleRules: 'Short sentences.',
      audienceRules: [audience],
      approvedExamples: [approved],
      rejectedExamples: [{ phrase: 'No.', reason: null }],
    };
    expect(input.messagingPillars?.[0]?.title).toBe('Quality');
    expect(input.audienceRules?.[0]?.audience).toBe('Partners');
    expect(input.approvedExamples?.[0]?.phrase).toBe('We partner.');
  });

  it('UpsertBrandVoiceInput accepts null writingStyleRules', () => {
    const input: UpsertBrandVoiceInput = { tone: 'Calm', writingStyleRules: null };
    expect(input.writingStyleRules).toBeNull();
  });
});
