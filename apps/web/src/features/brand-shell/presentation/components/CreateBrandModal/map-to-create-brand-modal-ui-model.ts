import type { CommonTranslations } from '@/features/presentation/localization/types';
import type { CreateBrandModalUIModel } from './types';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly nameError: string | null;
  readonly pending: boolean;
}

export function mapToCreateBrandModalUIModel(input: MapInput): CreateBrandModalUIModel {
  const labels = input.labels;
  return {
    title: labels.createModal.title,
    nameLabel: labels.createModal.nameLabel,
    namePlaceholder: labels.createModal.namePlaceholder,
    submitLabel: input.pending ? labels.createModal.submittingCta : labels.createModal.submitCta,
    submitDisabled: input.pending,
    pending: input.pending,
    cancelLabel: labels.createModal.cancelCta,
    nameError: input.nameError,
  };
}
