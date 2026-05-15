import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import { mapToNewBrandPageUIModel } from '../map-to-new-brand-page-ui-model';

const translations = {
  appName: '',
  loading: '',
  error: 'An error occurred',
  retry: '',
  save: '',
  cancel: 'Cancel',
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
  createBrand: 'Create brand',
  brandNameLabel: 'Brand name',
  brandNamePlaceholder: 'Acme',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'A short summary',
  submit: 'Submit',
  noBrandsTitle: '',
  noBrandsBody: '',
  noBrandsCta: '',
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
  validationBrandNameRequired: 'Brand name is required',
  validationBrandNameTooLong: 'Brand name must be at most 120 characters',
  validationDescriptionTooLong: 'Description must be at most 2000 characters',
  renameBrandTitle: '',
  deleteBrand: '',
  overview: '',
  brandVoice: '',
  visualIdentity: '',
} satisfies CommonTranslations;

describe('mapToNewBrandPageUIModel', () => {
  it('forwards the localized labels and submission state into the UI model', () => {
    const result = mapToNewBrandPageUIModel({
      translations,
      isSubmitting: true,
      serverError: 'boom',
    });
    expect(result).toMatchObject({
      title: 'Create brand',
      nameLabel: 'Brand name',
      submitLabel: 'Submit',
      cancelLabel: 'Cancel',
      isSubmitting: true,
      serverErrorLabel: 'boom',
      nameRequiredError: 'Brand name is required',
    });
  });

  it('passes null through when no server error is set', () => {
    const result = mapToNewBrandPageUIModel({
      translations,
      isSubmitting: false,
      serverError: null,
    });
    expect(result.serverErrorLabel).toBeNull();
    expect(result.isSubmitting).toBe(false);
  });
});
