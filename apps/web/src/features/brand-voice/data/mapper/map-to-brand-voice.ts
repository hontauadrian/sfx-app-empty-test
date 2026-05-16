import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

export interface AudienceRule {
  readonly audience: string;
  readonly rule: string;
}

export interface BrandVoice {
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

export function mapToBrandVoice(data: BrandVoiceDataModel): BrandVoice {
  return {
    brandProfileId: data.brandProfileId,
    toneOfVoice: data.toneOfVoice,
    preferredVocabulary: data.preferredVocabulary,
    restrictedVocabulary: data.restrictedVocabulary,
    messagingPillars: data.messagingPillars,
    writingStyleRules: data.writingStyleRules,
    audienceRules: data.audienceRules.map((entry) => ({
      audience: entry.audience,
      rule: entry.rule,
    })),
    approvedExamplePhrases: data.approvedExamplePhrases,
    rejectedExamplePhrases: data.rejectedExamplePhrases,
    createdAt: data.createdAt ? new Date(data.createdAt) : null,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
  };
}
