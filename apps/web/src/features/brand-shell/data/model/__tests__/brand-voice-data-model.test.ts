import { describe, expect, it } from 'vitest';
import type { BrandVoiceDataModel } from '../brand-voice-data-model';

describe('BrandVoiceDataModel', () => {
  it('accepts a fully populated value', () => {
    const sample: BrandVoiceDataModel = {
      brandId: 'clxbrand0001',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Short.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'Partner.' }],
      rejectedExamples: [{ phrase: 'No.', reason: null }],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T01:00:00.000Z',
    };
    expect(sample.brandId).toBe('clxbrand0001');
    expect(sample.messagingPillars[0]?.title).toBe('Trust');
  });
});
