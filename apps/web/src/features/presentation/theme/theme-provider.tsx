'use client';

import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { lightColors, darkColors, CSS_VAR_MAP } from './colors';
import type { AppTheme, Colors, ThemeMode } from './types';

export const ThemeContext = createContext<AppTheme | null>(null);

function applyColorsToElement(element: HTMLElement, colors: Colors): void {
  Object.entries(CSS_VAR_MAP).forEach(([key, varName]) => {
    element.style.setProperty(`--${varName}`, colors[key as keyof Colors]);
  });
}

interface ThemeProviderProps {
  readonly children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): ReactNode {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme-mode') as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      setMode(stored);
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const colors = mode === 'dark' ? darkColors : lightColors;
    applyColorsToElement(html, colors);
    if (mode === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  const toggleTheme = useCallback((): void => {
    setMode((previous) => (previous === 'light' ? 'dark' : 'light'));
  }, []);

  const colors = mode === 'dark' ? darkColors : lightColors;
  const theme: AppTheme = { mode, colors, toggleTheme };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
