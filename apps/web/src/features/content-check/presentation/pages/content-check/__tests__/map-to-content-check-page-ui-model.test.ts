import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import { mapToContentCheckPageUIModel } from '../map-to-content-check-page-ui-model';
import type { ContentCheckGroupedCategory } from '../../../helpers/group-entries';

const translations = {
  contentCheck: 'Content check',
  contentCheckPageTitle: 'Content check',
  contentCheckActiveBrandLabel: 'Active brand',
  contentCheckPastedTextLabel: 'Paste content to check',
  contentCheckPastedTextPlaceholder: 'Paste here',
  contentCheckCategoryLabel: 'Category',
  contentCheckCategoryAllOption: 'All categories',
  contentCheckSubmitLabel: 'Check content',
  contentCheckReferenceTextLabel: 'Reference text',
  contentCheckResultsTitle: 'Results',
  contentCheckSuggestedCorrectionLabel: 'Suggested correction',
  contentCheckNoActiveBrandTitle: 'Content check',
  contentCheckNoActiveBrandBody: 'Pick a brand body',
  contentCheckNoActiveBrandCta: 'Pick a brand',
  contentCheckZeroMatchesTitle: 'No matches title',
  contentCheckZeroMatchesBody: 'No matches body',
  contentCheckZeroMatchesCta: "+ Add do/don't",
  contentCheckBrandNotFoundTitle: 'Brand gone',
  contentCheckBrandNotFoundBody: 'Brand gone body',
  contentCheckBrandNotFoundCta: 'Pick a brand',
  contentCheckLoadError: 'Could not load',
  contentCheckPastedTextTooLongError: 'Too long',
  dosAndDontCategoryToneLabel: 'Tone',
  dosAndDontCategoryVocabularyLabel: 'Vocabulary',
  dosAndDontCategoryVisualsLabel: 'Visuals',
  dosAndDontCategoryLegalLabel: 'Legal',
  dosAndDontCategoryCampaignMessagingLabel: 'Campaign messaging',
  dosAndDontTypeDoLabel: 'Do',
  dosAndDontTypeDontLabel: "Don't",
} as unknown as CommonTranslations;

const baseInput = {
  translations,
  activeBrandId: null as string | null,
  activeBrandName: null as string | null,
  isLoading: false,
  isError: false,
  isBrandNotFound: false,
  entries: [] as readonly ContentCheckGroupedCategory[],
  pastedTextValue: '',
};

describe('mapToContentCheckPageUIModel', () => {
  it('returns the noActiveBrand state when there is no active brand', () => {
    const uiModel = mapToContentCheckPageUIModel({ ...baseInput, activeBrandId: null });
    expect(uiModel.state).toBe('noActiveBrand');
    expect(uiModel.emptyStateCtaHref).toBe('/');
    expect(uiModel.emptyStateCtaLabel).toBe('Pick a brand');
    expect(uiModel.groups).toEqual([]);
  });

  it('returns the brandNotFound state and takes precedence over noActiveBrand', () => {
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: null,
      isBrandNotFound: true,
    });
    expect(uiModel.state).toBe('brandNotFound');
    expect(uiModel.emptyStateCtaHref).toBe('/');
  });

  it('returns the error state when isError is true', () => {
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: 'brand-1',
      isError: true,
    });
    expect(uiModel.state).toBe('error');
    expect(uiModel.errorMessage).toBe('Could not load');
  });

  it('returns the loading state when isLoading is true and not in error', () => {
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: 'brand-1',
      isLoading: true,
    });
    expect(uiModel.state).toBe('loading');
  });

  it('returns the zeroMatches state with an /brands/<id> CTA when entries are empty', () => {
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: 'brand-1',
      entries: [],
    });
    expect(uiModel.state).toBe('zeroMatches');
    expect(uiModel.emptyStateCtaHref).toBe('/brands/brand-1');
    expect(uiModel.emptyStateCtaLabel).toBe("+ Add do/don't");
  });

  it('returns the populated state with grouped + labelled rows', () => {
    const grouped: readonly ContentCheckGroupedCategory[] = [
      {
        category: 'tone',
        types: [
          {
            type: 'do',
            entries: [
              {
                id: 'a',
                brandId: 'brand-1',
                type: 'do',
                category: 'tone',
                title: 'Be warm',
                body: 'Use warm phrasing.',
                suggestedCorrection: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        ],
      },
    ];
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: 'brand-1',
      entries: grouped,
    });
    expect(uiModel.state).toBe('populated');
    expect(uiModel.groups).toHaveLength(1);
    expect(uiModel.groups[0]?.key).toBe('tone');
    expect(uiModel.groups[0]?.categoryLabel).toBe('Tone');
    expect(uiModel.groups[0]?.rows[0]?.typeLabel).toBe('Do');
    expect(uiModel.groups[0]?.rows[0]?.entries[0]?.title).toBe('Be warm');
  });

  it('exposes all six category options including the All sentinel', () => {
    const uiModel = mapToContentCheckPageUIModel({ ...baseInput, activeBrandId: null });
    expect(uiModel.categoryOptions.map((option) => option.value)).toEqual([
      '',
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ]);
    expect(uiModel.categoryOptions[0]?.label).toBe('All categories');
  });

  it('passes the pasted text through to the UI model verbatim', () => {
    const uiModel = mapToContentCheckPageUIModel({
      ...baseInput,
      activeBrandId: 'brand-1',
      pastedTextValue: 'Some text\nwith newline',
    });
    expect(uiModel.pastedTextValue).toBe('Some text\nwith newline');
  });
});
