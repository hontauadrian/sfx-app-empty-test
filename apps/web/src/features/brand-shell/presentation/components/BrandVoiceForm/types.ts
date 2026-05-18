import type { UseFormReturn } from 'react-hook-form';
import type { UpsertBrandVoiceInput } from '@sfx/domain';

export interface BrandVoiceFormProps {
  readonly brandId: string;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export interface BrandVoiceSectionsCopy {
  readonly tone: string;
  readonly preferredVocabulary: string;
  readonly restrictedVocabulary: string;
  readonly messagingPillars: string;
  readonly writingStyle: string;
  readonly audienceRules: string;
  readonly approvedExamples: string;
  readonly rejectedExamples: string;
}

export interface BrandVoiceFieldCopy {
  readonly label: string;
  readonly placeholder?: string;
}

export interface BrandVoiceFieldsCopy {
  readonly tone: BrandVoiceFieldCopy;
  readonly preferredVocabulary: BrandVoiceFieldCopy;
  readonly restrictedVocabulary: BrandVoiceFieldCopy;
  readonly messagingPillarTitle: BrandVoiceFieldCopy;
  readonly messagingPillarDescription: BrandVoiceFieldCopy;
  readonly writingStyleRules: BrandVoiceFieldCopy;
  readonly audienceRulesAudience: BrandVoiceFieldCopy;
  readonly audienceRulesRules: BrandVoiceFieldCopy;
  readonly approvedExamplePhrase: BrandVoiceFieldCopy;
  readonly rejectedExamplePhrase: BrandVoiceFieldCopy;
  readonly rejectedExampleReason: BrandVoiceFieldCopy;
}

export interface BrandVoiceCtaCopy {
  readonly save: string;
  readonly saving: string;
  readonly addPreferred: string;
  readonly removePreferred: string;
  readonly addRestricted: string;
  readonly removeRestricted: string;
  readonly addPillar: string;
  readonly removePillar: string;
  readonly addAudienceRule: string;
  readonly removeAudienceRule: string;
  readonly addApprovedExample: string;
  readonly removeApprovedExample: string;
  readonly addRejectedExample: string;
  readonly removeRejectedExample: string;
}

export interface BrandVoiceFormUIModel {
  readonly status: 'loading' | 'ready';
  readonly pageTitle: string;
  readonly sections: BrandVoiceSectionsCopy;
  readonly fields: BrandVoiceFieldsCopy;
  readonly cta: BrandVoiceCtaCopy;
  readonly submitLabel: string;
  readonly isSubmitting: boolean;
  readonly submitDisabled: boolean;
  readonly formError: string | null;
}

export interface UseBrandVoiceFormReturn {
  readonly uiModel: BrandVoiceFormUIModel;
  readonly form: UseFormReturn<UpsertBrandVoiceInput>;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}
