import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDont } from '../../../data/mapper/map-to-dos-and-dont';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';
import type { EditDosAndDontPageUIModel } from './types';

export function buildDefaultValues(
  entry: DosAndDont | null | undefined,
): DosAndDontFormValues {
  if (!entry) {
    return {
      type: 'do',
      category: 'tone',
      title: '',
      body: '',
    };
  }
  return {
    type: entry.type,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    suggestedCorrection: entry.suggestedCorrection,
  };
}

export interface MapToEditDosAndDontInput {
  readonly translations: CommonTranslations;
  readonly entry: DosAndDont | null | undefined;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly serverError: string | null;
}

export function mapToEditDosAndDontPageUIModel(
  input: MapToEditDosAndDontInput,
): EditDosAndDontPageUIModel {
  const { translations, entry, isLoading, notFound, hasError, serverError } = input;
  return {
    title: translations.editDosAndDontPageTitle,
    submitLabel: translations.dosAndDontSubmitLabel,
    cancelLabel: translations.dosAndDontCancelLabel,
    isLoading,
    notFound,
    hasError,
    errorLabel: translations.error,
    notFoundLabel: translations.dosAndDontNotFound,
    serverErrorLabel: serverError,
    translations,
    defaultValues: buildDefaultValues(entry),
  };
}
