'use client';

import { useContext } from 'react';
import { ThemeContext } from './theme-provider';
import type { AppTheme } from './types';

export function useTheme(): AppTheme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
