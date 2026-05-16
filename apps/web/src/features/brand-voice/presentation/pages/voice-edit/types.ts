import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

export type VoiceEditNavigationTarget = 'cancel' | 'saved' | null;

export interface VoiceEditPageProps {
  readonly brandId: string;
}

export interface VoiceEditPageUIModel {
  readonly title: string;
  readonly saveLabel: string;
  readonly cancelLabel: string;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly errorLabel: string;
  readonly serverErrorLabel: string | null;
  readonly translations: CommonTranslations;
  readonly defaultValues: BrandVoiceFormValues;
}

export interface UseVoiceEditReturn {
  readonly uiModel: VoiceEditPageUIModel;
  readonly handleSubmit: (values: BrandVoiceFormValues) => Promise<void>;
  readonly handleCancel: () => void;
  readonly navigationTarget: VoiceEditNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly isSubmitting: boolean;
}
