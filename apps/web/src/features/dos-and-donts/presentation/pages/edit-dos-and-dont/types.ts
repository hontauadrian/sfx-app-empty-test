import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';

export type EditDosAndDontNavigationTarget = 'cancel' | 'saved' | null;

export interface EditDosAndDontPageProps {
  readonly brandId: string;
  readonly entryId: string;
}

export interface EditDosAndDontPageUIModel {
  readonly title: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly errorLabel: string;
  readonly notFoundLabel: string;
  readonly serverErrorLabel: string | null;
  readonly translations: CommonTranslations;
  readonly defaultValues: DosAndDontFormValues;
}

export interface UseEditDosAndDontReturn {
  readonly uiModel: EditDosAndDontPageUIModel;
  readonly handleSubmit: (values: DosAndDontFormValues) => Promise<void>;
  readonly handleCancel: () => void;
  readonly navigationTarget: EditDosAndDontNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly isSubmitting: boolean;
}
