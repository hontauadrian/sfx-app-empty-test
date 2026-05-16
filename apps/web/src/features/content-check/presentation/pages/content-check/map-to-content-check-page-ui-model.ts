import type { CommonTranslations } from '@/features/presentation/localization';
import type { DosAndDontCategory, DosAndDontType } from '@sfx/validation';
import { CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH } from '@sfx/validation';
import {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  DOS_AND_DONT_CATEGORY_VALUES,
  PICK_BRAND_ROUTE,
  addDosAndDontCtaHref,
} from '../../../constants';
import type {
  ContentCheckCategoryOption,
  ContentCheckPageUIModel,
  ContentCheckResultGroup,
  ContentCheckResultGroupRow,
  MapToContentCheckPageUIModelInput,
} from './types';

function categoryLabelOf(
  category: DosAndDontCategory,
  translations: CommonTranslations,
): string {
  switch (category) {
    case 'tone':
      return translations.dosAndDontCategoryToneLabel;
    case 'vocabulary':
      return translations.dosAndDontCategoryVocabularyLabel;
    case 'visuals':
      return translations.dosAndDontCategoryVisualsLabel;
    case 'legal':
      return translations.dosAndDontCategoryLegalLabel;
    case 'campaign-messaging':
      return translations.dosAndDontCategoryCampaignMessagingLabel;
  }
}

function typeLabelOf(type: DosAndDontType, translations: CommonTranslations): string {
  return type === 'do'
    ? translations.dosAndDontTypeDoLabel
    : translations.dosAndDontTypeDontLabel;
}

function buildCategoryOptions(
  translations: CommonTranslations,
): readonly ContentCheckCategoryOption[] {
  return [
    {
      value: CONTENT_CHECK_CATEGORY_ALL_VALUE,
      label: translations.contentCheckCategoryAllOption,
    },
    ...DOS_AND_DONT_CATEGORY_VALUES.map((category) => ({
      value: category,
      label: categoryLabelOf(category, translations),
    })),
  ];
}

export function mapToContentCheckPageUIModel(
  input: MapToContentCheckPageUIModelInput,
): ContentCheckPageUIModel {
  const {
    translations,
    activeBrandId,
    activeBrandName,
    isLoading,
    isError,
    isBrandNotFound,
    entries,
    pastedTextValue,
  } = input;

  const baseModel = {
    pageTitle: translations.contentCheckPageTitle,
    activeBrandLabel: translations.contentCheckActiveBrandLabel,
    activeBrandName,
    pastedTextLabel: translations.contentCheckPastedTextLabel,
    pastedTextPlaceholder: translations.contentCheckPastedTextPlaceholder,
    pastedTextValue,
    pastedTextMaxLength: CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
    categoryLabel: translations.contentCheckCategoryLabel,
    categoryOptions: buildCategoryOptions(translations),
    submitLabel: translations.contentCheckSubmitLabel,
    referenceTextLabel: translations.contentCheckReferenceTextLabel,
    resultsTitle: translations.contentCheckResultsTitle,
    suggestedCorrectionLabel: translations.contentCheckSuggestedCorrectionLabel,
    groups: [] as readonly ContentCheckResultGroup[],
    emptyStateTitle: null as string | null,
    emptyStateBody: null as string | null,
    emptyStateCtaLabel: null as string | null,
    emptyStateCtaHref: null as string | null,
    errorMessage: null as string | null,
  };

  if (isBrandNotFound) {
    return {
      ...baseModel,
      state: 'brandNotFound',
      emptyStateTitle: translations.contentCheckBrandNotFoundTitle,
      emptyStateBody: translations.contentCheckBrandNotFoundBody,
      emptyStateCtaLabel: translations.contentCheckBrandNotFoundCta,
      emptyStateCtaHref: PICK_BRAND_ROUTE,
    };
  }

  if (activeBrandId === null) {
    return {
      ...baseModel,
      state: 'noActiveBrand',
      emptyStateTitle: translations.contentCheckNoActiveBrandTitle,
      emptyStateBody: translations.contentCheckNoActiveBrandBody,
      emptyStateCtaLabel: translations.contentCheckNoActiveBrandCta,
      emptyStateCtaHref: PICK_BRAND_ROUTE,
    };
  }

  if (isError) {
    return {
      ...baseModel,
      state: 'error',
      errorMessage: translations.contentCheckLoadError,
    };
  }

  if (isLoading) {
    return { ...baseModel, state: 'loading' };
  }

  if (entries.length === 0) {
    return {
      ...baseModel,
      state: 'zeroMatches',
      emptyStateTitle: translations.contentCheckZeroMatchesTitle,
      emptyStateBody: translations.contentCheckZeroMatchesBody,
      emptyStateCtaLabel: translations.contentCheckZeroMatchesCta,
      emptyStateCtaHref: addDosAndDontCtaHref(activeBrandId),
    };
  }

  const groups: ContentCheckResultGroup[] = entries.map((group) => {
    const rows: ContentCheckResultGroupRow[] = group.types.map((row) => ({
      key: `${group.category}:${row.type}`,
      type: row.type,
      typeLabel: typeLabelOf(row.type, translations),
      entries: row.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        body: entry.body,
        suggestedCorrection: entry.suggestedCorrection,
      })),
    }));
    return {
      key: group.category,
      categoryLabel: categoryLabelOf(group.category, translations),
      rows,
    };
  });

  return {
    ...baseModel,
    state: 'populated',
    groups,
  };
}
