import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';

export interface DosAndDontEditFormProps {
  readonly defaultValues: DosAndDontFormValues;
  readonly translations: CommonTranslations;
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly onSubmit: (values: DosAndDontFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}
