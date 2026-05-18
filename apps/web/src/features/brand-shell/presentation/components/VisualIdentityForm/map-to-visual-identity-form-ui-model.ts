import type { AdminBrandGuidelinesVisualTranslations } from '@/features/presentation/localization/types';
import type { VisualIdentityFormUIModel } from './types';

export interface MapToVisualIdentityFormUIModelInput {
  readonly translations: AdminBrandGuidelinesVisualTranslations;
  readonly status: 'loading' | 'ready';
  readonly isSubmitting: boolean;
  readonly submitDisabled: boolean;
  readonly formError: string | null;
}

export function mapToVisualIdentityFormUIModel(
  input: MapToVisualIdentityFormUIModelInput,
): VisualIdentityFormUIModel {
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
