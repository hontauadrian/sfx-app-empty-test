export interface AudienceRule {
  readonly audience: string;
  readonly rule: string;
}

export interface BrandVoice {
  readonly id: string;
  readonly brandProfileId: string;
  readonly toneOfVoice: string | null;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly string[];
  readonly writingStyleRules: readonly string[];
  readonly audienceRules: readonly AudienceRule[];
  readonly approvedExamplePhrases: readonly string[];
  readonly rejectedExamplePhrases: readonly string[];
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}
