import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import { mapToBrandOverviewPageUIModel } from '../map-to-brand-overview-page-ui-model';

const translations = {
  appName: '',
  loading: '',
  error: 'Error',
  retry: '',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
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
  brandNameLabel: 'Brand name',
  brandNamePlaceholder: '',
  descriptionLabel: '',
  descriptionPlaceholder: '',
  submit: '',
  noBrandsTitle: '',
  noBrandsBody: '',
  noBrandsCta: '',
  brandSettings: 'Brand settings',
  rename: 'Rename',
  deleteBrandConfirmTitle: 'Delete brand',
  deleteBrandConfirmBody: 'Are you sure?',
  editBrandVoice: '+ Edit brand voice',
  editVisualIdentity: '+ Edit visual identity',
  brandVoiceSectionTitle: 'Brand voice',
  visualIdentitySectionTitle: 'Visual identity',
  signOut: '',
  selectBrand: '',
  validationBrandNameRequired: 'Required',
  validationBrandNameTooLong: 'Too long',
  validationDescriptionTooLong: '',
  renameBrandTitle: 'Rename brand',
  deleteBrand: 'Delete brand',
  overview: '',
  brandVoice: '',
  visualIdentity: '',
} satisfies CommonTranslations;

const brand = {
  id: 'brand-1',
  ownerSubject: 'sub-1',
  name: 'Acme',
  description: null,
  createdAt: new Date('2026-05-15T00:00:00.000Z'),
  updatedAt: new Date('2026-05-15T00:00:00.000Z'),
};

describe('mapToBrandOverviewPageUIModel', () => {
  it('forwards labels and shaped sub-page hrefs for the present brand', () => {
    const model = mapToBrandOverviewPageUIModel({
      translations,
      brand,
      brandId: 'brand-1',
      isLoading: false,
      isError: false,
      notFound: false,
    });
    expect(model.brandName).toBe('Acme');
    expect(model.brandVoiceCtaHref).toBe('/brands/brand-1/voice/edit');
    expect(model.visualIdentityCtaHref).toBe('/brands/brand-1/visual-identity/edit');
    expect(model.renameModalTitle).toBe('Rename brand');
    expect(model.deleteConfirmLabel).toBe('Delete');
  });

  it('flags notFound separately from generic errors', () => {
    const model = mapToBrandOverviewPageUIModel({
      translations,
      brand: undefined,
      brandId: 'brand-1',
      isLoading: false,
      isError: true,
      notFound: true,
    });
    expect(model.notFound).toBe(true);
    expect(model.hasError).toBe(false);
  });

  it('surfaces the error label for non-404 failures', () => {
    const model = mapToBrandOverviewPageUIModel({
      translations,
      brand: undefined,
      brandId: 'brand-1',
      isLoading: false,
      isError: true,
      notFound: false,
    });
    expect(model.hasError).toBe(true);
    expect(model.errorLabel).toBe('Error');
  });
});
