import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BrandVoiceEnvelopeDto } from '../brand-voice-envelope.dto';
import { BrandVoiceDto } from '../brand-voice.dto';

describe('BrandVoiceEnvelopeDto', () => {
  it('wraps a BrandVoiceDto under data with success: true', () => {
    const envelope = new BrandVoiceEnvelopeDto();
    envelope.success = true;
    const data = new BrandVoiceDto();
    data.brandProfileId = 'brand-1';
    data.toneOfVoice = null;
    data.preferredVocabulary = [];
    data.restrictedVocabulary = [];
    data.messagingPillars = [];
    data.writingStyleRules = [];
    data.audienceRules = [];
    data.approvedExamplePhrases = [];
    data.rejectedExamplePhrases = [];
    data.createdAt = null;
    data.updatedAt = null;
    envelope.data = data;
    expect(envelope.success).toBe(true);
    expect(envelope.data.brandProfileId).toBe('brand-1');
  });
});
