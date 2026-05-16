import type { CommonTranslations } from '@/features/presentation/localization';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

export interface VisualIdentityEditFormProps {
  readonly defaultValues: VisualIdentityFormValues;
  readonly translations: CommonTranslations;
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
  readonly saveLabel: string;
  readonly cancelLabel: string;
  readonly onSubmit: (values: VisualIdentityFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}
