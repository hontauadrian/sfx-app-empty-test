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
}

export interface TranslationNamespaces {
  readonly common: CommonTranslations;
}

export type TranslationNamespace = keyof TranslationNamespaces;
