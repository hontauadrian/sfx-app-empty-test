'use client';

import type { ReactNode } from 'react';
import { useGuidelineSearchRepository } from '../../../data/repositories/use-guideline-search-repository';
import { SearchResultsPanel } from '../SearchResultsPanel';
import type { SearchResultsContainerProps } from './types';

export function SearchResultsContainer({
  brandId,
  query,
}: SearchResultsContainerProps): ReactNode {
  const { searchQuery } = useGuidelineSearchRepository({ brandId, query });
  return (
    <SearchResultsPanel
      query={query}
      isLoading={searchQuery.isLoading && searchQuery.fetchStatus !== 'idle'}
      error={searchQuery.error}
      result={searchQuery.data}
    />
  );
}
