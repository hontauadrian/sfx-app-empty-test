import { describe, expect, it } from 'vitest';
import type { AudienceRule, BrandVoice } from '../brand-voice';

describe('BrandVoice entity', () => {
  it('accepts a fully-populated value satisfying every readonly field', () => {
    const rule: AudienceRule = { audience: 'Gen Z', rule: 'Use slang' };
    const voice: BrandVoice = {
      id: 'voice-1',
      brandProfileId: 'brand-1',
      toneOfVoice: 'Warm and direct',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['utilize'],
      messagingPillars: ['Trust'],
      writingStyleRules: ['Use active voice'],
      audienceRules: [rule],
      approvedExamplePhrases: ['We build trust.'],
      rejectedExamplePhrases: ['Synergize value-add.'],
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    expect(voice.id).toBe('voice-1');
    expect(voice.toneOfVoice).toBe('Warm and direct');
    expect(voice.audienceRules[0]).toEqual(rule);
  });

  it('accepts a voice with null toneOfVoice and empty lists', () => {
    const voice: BrandVoice = {
      id: 'voice-2',
      brandProfileId: 'brand-2',
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
    expect(voice.toneOfVoice).toBeNull();
    expect(voice.preferredVocabulary).toHaveLength(0);
    expect(voice.createdAt).toBeNull();
  });
});
