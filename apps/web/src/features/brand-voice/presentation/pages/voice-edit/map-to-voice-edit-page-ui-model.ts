import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandVoice } from '../../../data/mapper/map-to-brand-voice';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';
import type { VoiceEditPageUIModel } from './types';

export interface MapToVoiceEditInput {
  readonly translations: CommonTranslations;
  readonly voice: BrandVoice | undefined;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly serverError: string | null;
}

export function buildDefaultValues(voice: BrandVoice | undefined): BrandVoiceFormValues {
  if (!voice) {
    return {
      toneOfVoice: null,
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
    } as BrandVoiceFormValues;
  }
  return {
    toneOfVoice: voice.toneOfVoice,
    preferredVocabulary: [...voice.preferredVocabulary],
    restrictedVocabulary: [...voice.restrictedVocabulary],
    messagingPillars: [...voice.messagingPillars],
    writingStyleRules: [...voice.writingStyleRules],
    audienceRules: voice.audienceRules.map((entry) => ({
      audience: entry.audience,
      rule: entry.rule,
    })),
    approvedExamplePhrases: [...voice.approvedExamplePhrases],
    rejectedExamplePhrases: [...voice.rejectedExamplePhrases],
  } as BrandVoiceFormValues;
}

export function mapToVoiceEditPageUIModel(
  input: MapToVoiceEditInput,
): VoiceEditPageUIModel {
  const { translations, voice, isLoading, notFound, hasError, serverError } = input;
  return {
    title: translations.brandVoiceEditPageTitle,
    saveLabel: translations.save,
    cancelLabel: translations.cancel,
    isLoading,
    notFound,
    hasError,
    errorLabel: translations.error,
    serverErrorLabel: serverError,
    translations,
    defaultValues: buildDefaultValues(voice),
  };
}
