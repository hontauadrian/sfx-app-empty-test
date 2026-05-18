'use client';

import { useCallback, type ChangeEvent, type ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import type { SearchBarProps } from './types';

export function SearchBar({ value, onChange }: SearchBarProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.search!;
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => onChange(event.target.value),
    [onChange],
  );
  return (
    <div className="mt-4">
      <label className="sr-only" htmlFor="brand-guidelines-search">
        {labels.placeholder}
      </label>
      <input
        id="brand-guidelines-search"
        type="search"
        role="searchbox"
        value={value}
        onChange={handleChange}
        placeholder={labels.placeholder}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
