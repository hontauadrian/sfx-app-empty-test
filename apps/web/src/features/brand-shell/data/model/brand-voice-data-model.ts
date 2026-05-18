export interface BrandVoiceMessagingPillarDataModel {
  readonly title: string;
  readonly description: string;
}

export interface BrandVoiceAudienceRuleDataModel {
  readonly audience: string;
  readonly rules: string;
}

export interface BrandVoiceApprovedExampleDataModel {
  readonly phrase: string;
}

export interface BrandVoiceRejectedExampleDataModel {
  readonly phrase: string;
  readonly reason: string | null;
}

export interface BrandVoiceDataModel {
  readonly brandId: string;
  readonly tone: string;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly BrandVoiceMessagingPillarDataModel[];
  readonly writingStyleRules: string;
  readonly audienceRules: readonly BrandVoiceAudienceRuleDataModel[];
  readonly approvedExamples: readonly BrandVoiceApprovedExampleDataModel[];
  readonly rejectedExamples: readonly BrandVoiceRejectedExampleDataModel[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
