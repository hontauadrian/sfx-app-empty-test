import type { CommonTranslations } from '@/features/presentation/localization/types';
import type { DeleteBrandConfirmUIModel } from './types';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly brandName: string;
  readonly pending: boolean;
}

export function mapToDeleteBrandConfirmUIModel(input: MapInput): DeleteBrandConfirmUIModel {
  const labels = input.labels;
  return {
    title: labels.deleteConfirm.title,
    bodyMessage: labels.deleteConfirm.bodyTemplate.replace('{name}', input.brandName),
    confirmLabel: input.pending
      ? labels.deleteConfirm.confirmingCta
      : labels.deleteConfirm.confirmCta,
    confirmDisabled: input.pending,
    pending: input.pending,
    cancelLabel: labels.deleteConfirm.cancelCta,
  };
}
