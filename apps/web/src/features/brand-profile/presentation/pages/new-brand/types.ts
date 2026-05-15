import type { BrandProfileFormValues } from '../../validators/brand-profile-form';

export interface NewBrandPageUIModel {
  readonly title: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly descriptionLabel: string;
  readonly descriptionPlaceholder: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly isSubmitting: boolean;
  readonly serverErrorLabel: string | null;
  readonly nameRequiredError: string;
  readonly nameTooLongError: string;
  readonly descriptionTooLongError: string;
}

export interface UseNewBrandReturn {
  readonly uiModel: NewBrandPageUIModel;
  readonly handleSubmit: (values: BrandProfileFormValues) => Promise<void>;
  readonly handleCancel: () => void;
}
