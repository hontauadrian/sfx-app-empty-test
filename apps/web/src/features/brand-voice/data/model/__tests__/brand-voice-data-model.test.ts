import { describe, expect, it } from 'vitest';
import type {
  AudienceRuleDataModel,
  BrandVoiceDataModel,
} from '../brand-voice-data-model';

describe('BrandVoiceDataModel (type-only assertions)', () => {
  it('accepts a fully populated DTO payload', () => {
    const rule: AudienceRuleDataModel = { audience: 'Gen Z', rule: 'Peer.' };
    const value: BrandVoiceDataModel = {
      brandProfileId: 'b-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [rule],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    expect(value.brandProfileId).toBe('b-1');
    expect(value.audienceRules[0]).toBe(rule);
  });

  it('accepts an empty-defaults DTO payload', () => {
    const value: BrandVoiceDataModel = {
      brandProfileId: 'b-2',
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
    };
    expect(value.toneOfVoice).toBeNull();
    expect(value.createdAt).toBeNull();
  });
});
