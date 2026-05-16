import { describe, expect, it } from 'vitest';
import {
  BRAND_VOICE_REPOSITORY,
  type BrandVoiceUpsertInput,
  type IBrandVoiceRepository,
} from '../brand-voice-repository';
import type { BrandVoice } from '../../entities/brand-voice';

describe('BRAND_VOICE_REPOSITORY token', () => {
  it('is a Symbol distinct from other DI tokens', () => {
    expect(typeof BRAND_VOICE_REPOSITORY).toBe('symbol');
    expect(BRAND_VOICE_REPOSITORY.toString()).toContain('BRAND_VOICE_REPOSITORY');
  });
});

describe('IBrandVoiceRepository contract (type-only assertions)', () => {
  it('null-return implementations satisfy ownership-scoping contract', async () => {
    const empty: BrandVoiceUpsertInput = {
      toneOfVoice: null,
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
    };
    const stub: IBrandVoiceRepository = {
      findByBrand: async (): Promise<BrandVoice | null> => null,
      upsertForBrand: async (): Promise<BrandVoice | null> => null,
    };
    await expect(stub.findByBrand('brand', 'sub')).resolves.toBeNull();
    await expect(stub.upsertForBrand('brand', 'sub', empty)).resolves.toBeNull();
  });
});
