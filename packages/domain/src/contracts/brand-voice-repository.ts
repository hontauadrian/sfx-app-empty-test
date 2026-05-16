import type { AudienceRule, BrandVoice } from '../entities/brand-voice';

export const BRAND_VOICE_REPOSITORY = Symbol('BRAND_VOICE_REPOSITORY');

export interface BrandVoiceUpsertInput {
  readonly toneOfVoice: string | null;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly string[];
  readonly writingStyleRules: readonly string[];
  readonly audienceRules: readonly AudienceRule[];
  readonly approvedExamplePhrases: readonly string[];
  readonly rejectedExamplePhrases: readonly string[];
}

export interface IBrandVoiceRepository {
  findByBrand(
    brandProfileId: string,
    ownerSubject: string,
  ): Promise<BrandVoice | null>;
  upsertForBrand(
    brandProfileId: string,
    ownerSubject: string,
    payload: BrandVoiceUpsertInput,
  ): Promise<BrandVoice | null>;
}
