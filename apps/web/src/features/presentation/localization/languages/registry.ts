import type { LanguageCode, TranslationNamespaces } from '../types';
import { common as enCommon } from './en/common';
import { common as roCommon } from './ro/common';

export const LANGUAGE_DISPLAY_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  ro: 'Romana',
};

export const translations: Record<LanguageCode, TranslationNamespaces> = {
  en: { common: enCommon },
  ro: { common: roCommon },
};
