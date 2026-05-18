import type { BrandVoice } from '@sfx/domain';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

export function mapToBrandVoice(data: BrandVoiceDataModel): BrandVoice {
  return {
    brandId: data.brandId,
    tone: data.tone,
    preferredVocabulary: data.preferredVocabulary,
    restrictedVocabulary: data.restrictedVocabulary,
    messagingPillars: data.messagingPillars,
    writingStyleRules: data.writingStyleRules,
    audienceRules: data.audienceRules,
    approvedExamples: data.approvedExamples,
    rejectedExamples: data.rejectedExamples,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

export function mapToBrandVoiceOrNull(
  data: BrandVoiceDataModel | null | undefined,
): BrandVoice | null {
  if (data === null || data === undefined) return null;
  return mapToBrandVoice(data);
}
