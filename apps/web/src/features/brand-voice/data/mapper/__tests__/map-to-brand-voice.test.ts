import { describe, expect, it } from 'vitest';
import { mapToBrandVoice } from '../map-to-brand-voice';

describe('mapToBrandVoice', () => {
  it('coerces ISO timestamps to Date instances', () => {
    const result = mapToBrandVoice({
      brandProfileId: 'b-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer.' }],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.preferredVocabulary).toEqual(['craft']);
    expect(result.audienceRules).toEqual([{ audience: 'Gen Z', rule: 'Peer.' }]);
  });

  it('keeps null timestamps as null', () => {
    const result = mapToBrandVoice({
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
    });
    expect(result.createdAt).toBeNull();
    expect(result.updatedAt).toBeNull();
  });
});
