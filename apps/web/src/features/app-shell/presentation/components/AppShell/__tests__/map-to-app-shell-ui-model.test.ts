import { describe, expect, it } from 'vitest';
import {
  getBrandIdFromPath,
  mapToAppShellUIModel,
} from '../map-to-app-shell-ui-model';
import type { CommonTranslations } from '@/features/presentation/localization';

const translations = {
  appName: '',
  loading: '',
  error: '',
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
  brandGuidelinesAppName: 'Brand Guidelines',
  brands: 'Brands',
  createBrand: '',
  brandNameLabel: '',
  brandNamePlaceholder: '',
  descriptionLabel: '',
  descriptionPlaceholder: '',
  submit: '',
  noBrandsTitle: '',
  noBrandsBody: '',
  noBrandsCta: '+ Create brand',
  brandSettings: '',
  rename: '',
  deleteBrandConfirmTitle: '',
  deleteBrandConfirmBody: '',
  editBrandVoice: '',
  editVisualIdentity: '',
  brandVoiceSectionTitle: '',
  visualIdentitySectionTitle: '',
  signOut: 'Sign out',
  selectBrand: 'Select brand',
  validationBrandNameRequired: '',
  validationBrandNameTooLong: '',
  validationDescriptionTooLong: '',
  renameBrandTitle: '',
  deleteBrand: '',
  overview: 'Overview',
  brandVoice: 'Brand voice',
  visualIdentity: 'Visual identity',
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
  visualIdentityEditPageTitle: '',
  visualIdentityEmptyStateBody: '',
  visualIdentityLogoUsageRulesLabel: '',
  visualIdentitySpacingLayoutGuidanceLabel: '',
  visualIdentityImageStyleGuidanceLabel: '',
  visualIdentityIconographyGuidanceLabel: '',
  visualIdentityUsageRestrictionsLabel: '',
  visualIdentityColourPaletteLabel: '',
  visualIdentityTypographyRulesLabel: '',
  visualIdentityColourPaletteNameLabel: '',
  visualIdentityColourPaletteHexLabel: '',
  visualIdentityColourPaletteUsageLabel: '',
  visualIdentityTypographyRoleLabel: '',
  visualIdentityTypographyFamilyLabel: '',
  visualIdentityTypographyWeightLabel: '',
  visualIdentityTypographySizeLabel: '',
  visualIdentityTypographyNotesLabel: '',
  visualIdentityAddRow: '',
  visualIdentityRemoveRow: '',
  visualIdentityEmptyListPlaceholder: '',
  dosAndDontsSectionTitle: '',
  dosAndDontsEmptyStateBody: '',
  addDosAndDontCta: '',
  editDosAndDontCta: '',
  deleteDosAndDontCta: '',
  dosAndDontTypeLabel: '',
  dosAndDontCategoryLabel: '',
  dosAndDontTitleLabel: '',
  dosAndDontBodyLabel: '',
  dosAndDontSuggestedCorrectionLabel: '',
  dosAndDontTypeDoLabel: '',
  dosAndDontTypeDontLabel: '',
  dosAndDontCategoryToneLabel: '',
  dosAndDontCategoryVocabularyLabel: '',
  dosAndDontCategoryVisualsLabel: '',
  dosAndDontCategoryLegalLabel: '',
  dosAndDontCategoryCampaignMessagingLabel: '',
  newDosAndDontPageTitle: '',
  editDosAndDontPageTitle: '',
  dosAndDontSubmitLabel: '',
  dosAndDontCancelLabel: '',
  dosAndDontSaveError: '',
  dosAndDontTitleRequiredError: '',
  dosAndDontTitleTooLongError: '',
  dosAndDontBodyRequiredError: '',
  dosAndDontBodyTooLongError: '',
  dosAndDontSuggestedCorrectionTooLongError: '',
  dosAndDontTypeRequiredError: '',
  dosAndDontCategoryRequiredError: '',
  deleteDosAndDontConfirmTitle: '',
  deleteDosAndDontConfirmBody: '',
  dosAndDontNotFound: '',
  contentCheck: 'Content check',
  contentCheckPageTitle: '',
  contentCheckActiveBrandLabel: '',
  contentCheckPastedTextLabel: '',
  contentCheckPastedTextPlaceholder: '',
  contentCheckCategoryLabel: '',
  contentCheckCategoryAllOption: '',
  contentCheckSubmitLabel: '',
  contentCheckReferenceTextLabel: '',
  contentCheckResultsTitle: '',
  contentCheckSuggestedCorrectionLabel: '',
  contentCheckNoActiveBrandTitle: '',
  contentCheckNoActiveBrandBody: '',
  contentCheckNoActiveBrandCta: '',
  contentCheckZeroMatchesTitle: '',
  contentCheckZeroMatchesBody: '',
  contentCheckZeroMatchesCta: '',
  contentCheckBrandNotFoundTitle: '',
  contentCheckBrandNotFoundBody: '',
  contentCheckBrandNotFoundCta: '',
  contentCheckLoadError: '',
  contentCheckPastedTextTooLongError: '',
} satisfies CommonTranslations;

const brand = {
  id: 'brand-1',
  ownerSubject: 'sub-1',
  name: 'Acme',
  description: null,
  createdAt: new Date('2026-05-15T00:00:00.000Z'),
  updatedAt: new Date('2026-05-15T00:00:00.000Z'),
};

describe('getBrandIdFromPath', () => {
  it('extracts the brand id from /brands/:id', () => {
    expect(getBrandIdFromPath('/brands/abc')).toBe('abc');
  });

  it('extracts the brand id from a nested route', () => {
    expect(getBrandIdFromPath('/brands/abc/voice/edit')).toBe('abc');
  });

  it('returns null for the new-brand route', () => {
    expect(getBrandIdFromPath('/brands/new')).toBeNull();
  });

  it('returns null for unrelated routes', () => {
    expect(getBrandIdFromPath('/')).toBeNull();
    expect(getBrandIdFromPath(null)).toBeNull();
  });
});

describe('mapToAppShellUIModel', () => {
  it('appends per-brand nav entries after the content-check entry on brand-scoped routes', () => {
    const model = mapToAppShellUIModel({
      translations,
      brands: [brand],
      activeBrandId: 'brand-1',
      pathname: '/brands/brand-1',
      email: 'user@example.com',
      signOutHref: '/oauth2/sign_out',
    });

    expect(model.leftNavItems.map((item) => item.key)).toEqual([
      'content-check',
      'overview',
      'brand-voice',
      'visual-identity',
    ]);
    expect(model.leftNavItems[1]?.href).toBe('/brands/brand-1');
    expect(model.currentBrandName).toBe('Acme');
    expect(model.email).toBe('user@example.com');
  });

  it('exposes only the content-check entry on the dashboard', () => {
    const model = mapToAppShellUIModel({
      translations,
      brands: [brand],
      activeBrandId: null,
      pathname: '/',
      email: null,
      signOutHref: '/oauth2/sign_out',
    });
    expect(model.leftNavItems).toHaveLength(1);
    expect(model.leftNavItems[0]).toEqual({
      key: 'content-check',
      label: 'Content check',
      href: '/content-check',
    });
    expect(model.currentBrandName).toBeNull();
  });

  it('exposes only the content-check entry on the /content-check route', () => {
    const model = mapToAppShellUIModel({
      translations,
      brands: [brand],
      activeBrandId: 'brand-1',
      pathname: '/content-check',
      email: null,
      signOutHref: '/oauth2/sign_out',
    });
    expect(model.leftNavItems).toHaveLength(1);
    expect(model.leftNavItems[0]?.key).toBe('content-check');
  });

  it('handles a stale active brand id by falling back to a null current name', () => {
    const model = mapToAppShellUIModel({
      translations,
      brands: [brand],
      activeBrandId: 'gone',
      pathname: '/',
      email: null,
      signOutHref: '/oauth2/sign_out',
    });
    expect(model.currentBrandName).toBeNull();
  });
});
