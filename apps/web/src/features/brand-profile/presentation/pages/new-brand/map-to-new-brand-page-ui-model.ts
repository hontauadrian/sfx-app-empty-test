import type { CommonTranslations } from '@/features/presentation/localization';
import type { NewBrandPageUIModel } from './types';

interface MapToNewBrandInput {
  readonly translations: CommonTranslations;
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
}

export function mapToNewBrandPageUIModel(input: MapToNewBrandInput): NewBrandPageUIModel {
  const { translations, isSubmitting, serverError } = input;
  return {
    title: translations.createBrand,
    nameLabel: translations.brandNameLabel,
    namePlaceholder: translations.brandNamePlaceholder,
    descriptionLabel: translations.descriptionLabel,
    descriptionPlaceholder: translations.descriptionPlaceholder,
    submitLabel: translations.submit,
    cancelLabel: translations.cancel,
    isSubmitting,
    serverErrorLabel: serverError,
    nameRequiredError: translations.validationBrandNameRequired,
    nameTooLongError: translations.validationBrandNameTooLong,
    descriptionTooLongError: translations.validationDescriptionTooLong,
  };
}
