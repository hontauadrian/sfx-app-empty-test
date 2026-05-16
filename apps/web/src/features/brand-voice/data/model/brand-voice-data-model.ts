export interface AudienceRuleDataModel {
  readonly audience: string;
  readonly rule: string;
}

export interface BrandVoiceDataModel {
  readonly brandProfileId: string;
  readonly toneOfVoice: string | null;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly string[];
  readonly writingStyleRules: readonly string[];
  readonly audienceRules: readonly AudienceRuleDataModel[];
  readonly approvedExamplePhrases: readonly string[];
  readonly rejectedExamplePhrases: readonly string[];
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
