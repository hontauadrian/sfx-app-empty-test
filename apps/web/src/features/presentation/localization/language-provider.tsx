'use client';

import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { LanguageCode } from './types';

interface LanguageContextValue {
  readonly language: LanguageCode;
  readonly setLanguage: (language: LanguageCode) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  readonly children: ReactNode;
  readonly defaultLanguage?: LanguageCode;
}

export function LanguageProvider({
  children,
  defaultLanguage = 'en',
}: LanguageProviderProps): ReactNode {
  const [language, setLanguageState] = useState<LanguageCode>(defaultLanguage);

  const setLanguage = useCallback((newLanguage: LanguageCode): void => {
    setLanguageState(newLanguage);
    localStorage.setItem('language', newLanguage);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
