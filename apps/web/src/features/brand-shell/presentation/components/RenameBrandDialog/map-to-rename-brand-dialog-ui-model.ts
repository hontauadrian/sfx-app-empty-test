import type { CommonTranslations } from '@/features/presentation/localization/types';
import type { RenameBrandDialogUIModel } from './types';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly nameError: string | null;
  readonly pending: boolean;
}

export function mapToRenameBrandDialogUIModel(input: MapInput): RenameBrandDialogUIModel {
  const labels = input.labels;
  return {
    title: labels.rename.title,
    nameLabel: labels.rename.nameLabel,
    submitLabel: input.pending ? labels.rename.submittingCta : labels.rename.submitCta,
    submitDisabled: input.pending,
    pending: input.pending,
    cancelLabel: labels.rename.cancelCta,
    nameError: input.nameError,
  };
}
