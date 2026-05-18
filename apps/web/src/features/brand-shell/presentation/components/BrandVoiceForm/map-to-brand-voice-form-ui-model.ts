import type { AdminBrandGuidelinesVoiceTranslations } from '@/features/presentation/localization/types';
import type { BrandVoiceFormUIModel } from './types';

export interface MapToBrandVoiceFormUIModelInput {
  readonly translations: AdminBrandGuidelinesVoiceTranslations;
  readonly status: 'loading' | 'ready';
  readonly isSubmitting: boolean;
  readonly submitDisabled: boolean;
  readonly formError: string | null;
}

export function mapToBrandVoiceFormUIModel(
  input: MapToBrandVoiceFormUIModelInput,
): BrandVoiceFormUIModel {
  const cta = input.translations.cta;
  return {
    status: input.status,
    pageTitle: input.translations.pageTitle,
    sections: input.translations.sections,
    fields: input.translations.fields,
    cta,
    submitLabel: input.isSubmitting ? cta.saving : cta.save,
    isSubmitting: input.isSubmitting,
    submitDisabled: input.submitDisabled,
    formError: input.formError,
  };
}
