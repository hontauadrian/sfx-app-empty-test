import type { CommonTranslations } from '@/features/presentation/localization';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

export type EditVisualIdentityNavigationTarget = 'cancel' | 'saved' | null;

export interface EditVisualIdentityPageProps {
  readonly brandId: string;
}

export interface EditVisualIdentityPageUIModel {
  readonly title: string;
  readonly saveLabel: string;
  readonly cancelLabel: string;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly errorLabel: string;
  readonly serverErrorLabel: string | null;
  readonly translations: CommonTranslations;
  readonly defaultValues: VisualIdentityFormValues;
}

export interface UseEditVisualIdentityReturn {
  readonly uiModel: EditVisualIdentityPageUIModel;
  readonly handleSubmit: (values: VisualIdentityFormValues) => Promise<void>;
  readonly handleCancel: () => void;
  readonly navigationTarget: EditVisualIdentityNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly isSubmitting: boolean;
}
