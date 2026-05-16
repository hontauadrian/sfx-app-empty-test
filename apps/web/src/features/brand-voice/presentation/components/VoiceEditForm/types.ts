import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

export interface VoiceEditFormProps {
  readonly defaultValues: BrandVoiceFormValues;
  readonly translations: CommonTranslations;
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
  readonly saveLabel: string;
  readonly cancelLabel: string;
  readonly onSubmit: (values: BrandVoiceFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}
