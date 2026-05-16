import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BrandVoiceDto } from '../brand-voice.dto';

describe('BrandVoiceDto', () => {
  it('accepts a populated voice resource shape', () => {
    const dto = new BrandVoiceDto();
    dto.brandProfileId = 'brand-1';
    dto.toneOfVoice = 'Warm.';
    dto.preferredVocabulary = ['craft'];
    dto.restrictedVocabulary = ['utilize'];
    dto.messagingPillars = ['Trust'];
    dto.writingStyleRules = ['Use active voice.'];
    dto.audienceRules = [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }];
    dto.approvedExamplePhrases = ['Hi'];
    dto.rejectedExamplePhrases = ['Hey'];
    dto.createdAt = '2026-05-15T00:00:00.000Z';
    dto.updatedAt = '2026-05-15T00:00:00.000Z';
    expect(dto.brandProfileId).toBe('brand-1');
    expect(dto.toneOfVoice).toBe('Warm.');
    expect(dto.audienceRules).toHaveLength(1);
  });

  it('accepts the empty defaults shape', () => {
    const dto = new BrandVoiceDto();
    dto.brandProfileId = 'brand-2';
    dto.toneOfVoice = null;
    dto.preferredVocabulary = [];
    dto.restrictedVocabulary = [];
    dto.messagingPillars = [];
    dto.writingStyleRules = [];
    dto.audienceRules = [];
    dto.approvedExamplePhrases = [];
    dto.rejectedExamplePhrases = [];
    dto.createdAt = null;
    dto.updatedAt = null;
    expect(dto.toneOfVoice).toBeNull();
    expect(dto.createdAt).toBeNull();
  });
});
