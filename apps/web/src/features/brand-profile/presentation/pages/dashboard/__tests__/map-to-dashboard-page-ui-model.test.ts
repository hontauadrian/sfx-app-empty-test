import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import {
  deriveDashboardSideEffect,
  mapToDashboardPageUIModel,
} from '../map-to-dashboard-page-ui-model';
import type { BrandProfile } from '../../../../data/mapper/map-to-brand-profile';

const baseTranslations: CommonTranslations = {
  appName: '',
  loading: 'Loading...',
  error: 'Error',
  retry: '',
  save: '',
  cancel: '',
  delete: '',
  confirm: '',
  search: '',
  noResults: '',
  healthStatus: '',
  connected: '',
  disconnected: '',
  getStarted: '',
  apiDocs: '',
  logout: '',
  pendingAccessTitle: '',
  pendingAccessMessage: '',
  brandGuidelinesAppName: '',
  brands: '',
  createBrand: '',
  brandNameLabel: '',
  brandNamePlaceholder: '',
  descriptionLabel: '',
  descriptionPlaceholder: '',
  submit: '',
  noBrandsTitle: 'No brands yet',
  noBrandsBody: 'Create your first brand to start building its identity.',
  noBrandsCta: '+ Create brand',
  brandSettings: '',
  rename: '',
  deleteBrandConfirmTitle: '',
  deleteBrandConfirmBody: '',
  editBrandVoice: '',
  editVisualIdentity: '',
  brandVoiceSectionTitle: '',
  visualIdentitySectionTitle: '',
  signOut: '',
  selectBrand: '',
  validationBrandNameRequired: '',
  validationBrandNameTooLong: '',
  validationDescriptionTooLong: '',
  renameBrandTitle: '',
  deleteBrand: '',
  overview: '',
  brandVoice: '',
  visualIdentity: '',
  brandVoiceEditPageTitle: '',
  brandVoiceEmptyStateBody: '',
  brandVoiceToneOfVoiceLabel: '',
  brandVoicePreferredVocabularyLabel: '',
  brandVoiceRestrictedVocabularyLabel: '',
  brandVoiceMessagingPillarsLabel: '',
  brandVoiceWritingStyleRulesLabel: '',
  brandVoiceAudienceRulesLabel: '',
  brandVoiceApprovedPhrasesLabel: '',
  brandVoiceRejectedPhrasesLabel: '',
  brandVoiceAudienceRuleAudienceLabel: '',
  brandVoiceAudienceRuleRuleLabel: '',
  brandVoiceAddRow: '',
  brandVoiceRemoveRow: '',
  brandVoiceEmptyListPlaceholder: '',
  brandVoiceValidationToneTooLong: '',
  brandVoiceValidationListItemRequired: '',
  brandVoiceValidationListItemTooLong: '',
  brandVoiceValidationListItemDuplicate: '',
  brandVoiceValidationAudienceRequired: '',
  brandVoiceValidationRuleRequired: '',
  brandVoiceValidationListTooLong: '',
};

function buildBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'brand-1',
    ownerSubject: 'sub-1',
    name: 'Acme',
    description: null,
    createdAt: new Date('2026-05-15T10:00:00.000Z'),
    updatedAt: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  };
}

describe('deriveDashboardSideEffect', () => {
  it('returns no redirect when there are no brands and no stored id', () => {
    expect(deriveDashboardSideEffect([], null)).toEqual({
      nextActiveBrandId: null,
      redirectTo: null,
      shouldClearStore: false,
    });
  });

  it('clears the store when the stored id has no matching brand', () => {
    expect(deriveDashboardSideEffect([buildBrand()], 'gone')).toEqual({
      nextActiveBrandId: null,
      redirectTo: null,
      shouldClearStore: true,
    });
  });

  it('redirects to the most-recently-updated brand when nothing is stored', () => {
    const result = deriveDashboardSideEffect(
      [
        buildBrand({ id: 'a', updatedAt: new Date('2026-05-10T00:00:00.000Z') }),
        buildBrand({ id: 'b', updatedAt: new Date('2026-05-14T00:00:00.000Z') }),
      ],
      null,
    );
    expect(result.nextActiveBrandId).toBe('b');
    expect(result.redirectTo).toBe('/brands/b');
  });

  it('honours the stored id when it still exists', () => {
    const result = deriveDashboardSideEffect([buildBrand({ id: 'a' })], 'a');
    expect(result.redirectTo).toBe('/brands/a');
    expect(result.shouldClearStore).toBe(false);
  });

  it('also clears the store when the stored id has no matching brand AND no brands exist', () => {
    expect(deriveDashboardSideEffect([], 'gone')).toEqual({
      nextActiveBrandId: null,
      redirectTo: null,
      shouldClearStore: true,
    });
  });
});

describe('mapToDashboardPageUIModel', () => {
  it('renders the loading state when the query is in flight', () => {
    const result = mapToDashboardPageUIModel({
      translations: baseTranslations,
      brands: undefined,
      storedActiveBrandId: null,
      isLoading: true,
      isError: false,
    });
    expect(result.isLoading).toBe(true);
    expect(result.showEmptyState).toBe(false);
  });

  it('renders the empty state when the user owns no brands', () => {
    const result = mapToDashboardPageUIModel({
      translations: baseTranslations,
      brands: [],
      storedActiveBrandId: null,
      isLoading: false,
      isError: false,
    });
    expect(result.showEmptyState).toBe(true);
    expect(result.emptyStateCtaHref).toBe('/brands/new');
  });

  it('returns a redirect target when the user has brands but no stored active id', () => {
    const result = mapToDashboardPageUIModel({
      translations: baseTranslations,
      brands: [buildBrand({ id: 'b' })],
      storedActiveBrandId: null,
      isLoading: false,
      isError: false,
    });
    expect(result.redirectTo).toBe('/brands/b');
  });

  it('surfaces the error label when the query fails', () => {
    const result = mapToDashboardPageUIModel({
      translations: baseTranslations,
      brands: undefined,
      storedActiveBrandId: null,
      isLoading: false,
      isError: true,
    });
    expect(result.hasError).toBe(true);
    expect(result.errorLabel).toBe('Error');
  });
});
