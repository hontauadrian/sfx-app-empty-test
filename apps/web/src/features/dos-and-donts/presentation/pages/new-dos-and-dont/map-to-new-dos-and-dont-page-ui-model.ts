import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';
import type { NewDosAndDontPageUIModel } from './types';

export const DEFAULT_NEW_DOS_AND_DONT_VALUES: DosAndDontFormValues = {
  type: 'do',
  category: 'tone',
  title: '',
  body: '',
};

export interface MapToNewDosAndDontInput {
  readonly translations: CommonTranslations;
  readonly serverError: string | null;
}

export function mapToNewDosAndDontPageUIModel(
  input: MapToNewDosAndDontInput,
): NewDosAndDontPageUIModel {
  return {
    title: input.translations.newDosAndDontPageTitle,
    submitLabel: input.translations.dosAndDontSubmitLabel,
    cancelLabel: input.translations.dosAndDontCancelLabel,
    translations: input.translations,
    defaultValues: DEFAULT_NEW_DOS_AND_DONT_VALUES,
    serverErrorLabel: input.serverError,
  };
}
