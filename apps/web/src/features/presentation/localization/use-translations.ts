'use client';

import { useContext } from 'react';
import { LanguageContext } from './language-provider';
import { translations } from './languages/registry';
import type { TranslationNamespace, TranslationNamespaces } from './types';

export function useTranslations<T extends TranslationNamespace>(
  namespace: T,
): TranslationNamespaces[T] {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslations must be used within a LanguageProvider');
  }
  return translations[context.language][namespace];
}
