import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';

export type NewDosAndDontNavigationTarget = 'cancel' | 'saved' | null;

export interface NewDosAndDontPageProps {
  readonly brandId: string;
}

export interface NewDosAndDontPageUIModel {
  readonly title: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly translations: CommonTranslations;
  readonly defaultValues: DosAndDontFormValues;
  readonly serverErrorLabel: string | null;
}

export interface UseNewDosAndDontReturn {
  readonly uiModel: NewDosAndDontPageUIModel;
  readonly handleSubmit: (values: DosAndDontFormValues) => Promise<void>;
  readonly handleCancel: () => void;
  readonly navigationTarget: NewDosAndDontNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly isSubmitting: boolean;
}
