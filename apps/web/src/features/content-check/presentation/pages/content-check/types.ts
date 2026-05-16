import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontCategory } from '@sfx/validation';
import type { ContentCheckFormValues } from '../../validators/content-check-form';
import type { ContentCheckGroupedCategory } from '../../helpers/group-entries';

export type ContentCheckPageState =
  | 'noActiveBrand'
  | 'brandNotFound'
  | 'error'
  | 'loading'
  | 'zeroMatches'
  | 'populated';

export interface ContentCheckCategoryOption {
  readonly value: '' | DosAndDontCategory;
  readonly label: string;
}

export interface ContentCheckResultGroupRow {
  readonly key: string;
  readonly type: 'do' | 'dont';
  readonly typeLabel: string;
  readonly entries: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly suggestedCorrection: string | null;
  }>;
}

export interface ContentCheckResultGroup {
  readonly key: string;
  readonly categoryLabel: string;
  readonly rows: readonly ContentCheckResultGroupRow[];
}

export interface ContentCheckPageUIModel {
  readonly state: ContentCheckPageState;
  readonly pageTitle: string;
  readonly activeBrandLabel: string;
  readonly activeBrandName: string | null;
  readonly pastedTextLabel: string;
  readonly pastedTextPlaceholder: string;
  readonly pastedTextValue: string;
  readonly pastedTextMaxLength: number;
  readonly categoryLabel: string;
  readonly categoryOptions: readonly ContentCheckCategoryOption[];
  readonly submitLabel: string;
  readonly referenceTextLabel: string;
  readonly resultsTitle: string;
  readonly suggestedCorrectionLabel: string;
  readonly groups: readonly ContentCheckResultGroup[];
  readonly emptyStateTitle: string | null;
  readonly emptyStateBody: string | null;
  readonly emptyStateCtaLabel: string | null;
  readonly emptyStateCtaHref: string | null;
  readonly errorMessage: string | null;
}

export interface MapToContentCheckPageUIModelInput {
  readonly translations: CommonTranslations;
  readonly activeBrandId: string | null;
  readonly activeBrandName: string | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBrandNotFound: boolean;
  readonly entries: readonly ContentCheckGroupedCategory[];
  readonly pastedTextValue: string;
}

export interface UseContentCheckReturn {
  readonly uiModel: ContentCheckPageUIModel;
  readonly register: UseFormRegister<ContentCheckFormValues>;
  readonly handleSubmit: UseFormHandleSubmit<ContentCheckFormValues>;
  readonly handleCheckContent: () => void;
  readonly formErrors: FieldErrors<ContentCheckFormValues>;
}
