export type LanguageCode = 'en' | 'ro';

export interface CommonTranslations {
  readonly appName: string;
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  readonly save: string;
  readonly cancel: string;
  readonly delete: string;
  readonly confirm: string;
  readonly search: string;
  readonly noResults: string;
  readonly healthStatus: string;
  readonly connected: string;
  readonly disconnected: string;
  readonly getStarted: string;
  readonly apiDocs: string;
  readonly logout: string;
  readonly pendingAccessTitle: string;
  readonly pendingAccessMessage: string;
  readonly brandGuidelinesAppName: string;
  readonly brands: string;
  readonly createBrand: string;
  readonly brandNameLabel: string;
  readonly brandNamePlaceholder: string;
  readonly descriptionLabel: string;
  readonly descriptionPlaceholder: string;
  readonly submit: string;
  readonly noBrandsTitle: string;
  readonly noBrandsBody: string;
  readonly noBrandsCta: string;
  readonly brandSettings: string;
  readonly rename: string;
  readonly deleteBrandConfirmTitle: string;
  readonly deleteBrandConfirmBody: string;
  readonly editBrandVoice: string;
  readonly editVisualIdentity: string;
  readonly brandVoiceSectionTitle: string;
  readonly visualIdentitySectionTitle: string;
  readonly signOut: string;
  readonly selectBrand: string;
  readonly validationBrandNameRequired: string;
  readonly validationBrandNameTooLong: string;
  readonly validationDescriptionTooLong: string;
  readonly renameBrandTitle: string;
  readonly deleteBrand: string;
  readonly overview: string;
  readonly brandVoice: string;
  readonly visualIdentity: string;
}

export interface TranslationNamespaces {
  readonly common: CommonTranslations;
}

export type TranslationNamespace = keyof TranslationNamespaces;
