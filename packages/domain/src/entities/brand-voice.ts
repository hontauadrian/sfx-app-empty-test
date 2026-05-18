// Brand Voice — per-brand singleton sub-resource.
//
// A `BrandVoice` is uniquely keyed by `brandId` (1:0..1 with `Brand`):
// at most one voice row exists per brand. Lists default to empty arrays
// at the data-mapper boundary; optional text fields are stored as `""`
// when the client omits them.

export interface BrandVoiceMessagingPillar {
  readonly title: string;
  readonly description: string;
}

export interface BrandVoiceAudienceRule {
  readonly audience: string;
  readonly rules: string;
}

export interface BrandVoiceApprovedExample {
  readonly phrase: string;
}

export interface BrandVoiceRejectedExample {
  readonly phrase: string;
  readonly reason: string | null;
}

export interface BrandVoice {
  readonly brandId: string;
  readonly tone: string;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly BrandVoiceMessagingPillar[];
  readonly writingStyleRules: string;
  readonly audienceRules: readonly BrandVoiceAudienceRule[];
  readonly approvedExamples: readonly BrandVoiceApprovedExample[];
  readonly rejectedExamples: readonly BrandVoiceRejectedExample[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertBrandVoiceRejectedExampleInput {
  readonly phrase: string;
  readonly reason?: string | null;
}

export interface UpsertBrandVoiceInput {
  readonly tone: string;
  readonly preferredVocabulary?: readonly string[];
  readonly restrictedVocabulary?: readonly string[];
  readonly messagingPillars?: readonly BrandVoiceMessagingPillar[];
  readonly writingStyleRules?: string | null;
  readonly audienceRules?: readonly BrandVoiceAudienceRule[];
  readonly approvedExamples?: readonly BrandVoiceApprovedExample[];
  readonly rejectedExamples?: readonly UpsertBrandVoiceRejectedExampleInput[];
}
