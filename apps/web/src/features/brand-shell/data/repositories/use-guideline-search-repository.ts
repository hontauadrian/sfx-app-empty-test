'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { GuidelineSearchResult } from '@sfx/domain';
import { guidelineSearchQueryKey } from '../../constants';
import { mapToGuidelineSearchResult } from '../mapper/map-to-guideline-search-result';
import { fetchGuidelineSearch } from '../remote/fetch-guideline-search';
import type { GuidelineSearchResponseDataModel } from '../model/guideline-search-data-model';

export interface UseGuidelineSearchRepositoryReturn {
  readonly searchQuery: UseQueryResult<GuidelineSearchResult>;
}

export function useGuidelineSearchRepository(input: {
  readonly brandId: string;
  readonly query: string;
}): UseGuidelineSearchRepositoryReturn {
  const trimmed = input.query.trim();
  const queryKey = guidelineSearchQueryKey(input.brandId, trimmed);

  const searchQuery = useQuery({
    queryKey,
    queryFn: () => fetchGuidelineSearch({ brandId: input.brandId, query: trimmed }),
    select: (data: GuidelineSearchResponseDataModel): GuidelineSearchResult =>
      mapToGuidelineSearchResult(data),
    enabled: trimmed.length > 0,
    retry: false,
  });

  return { searchQuery };
}
