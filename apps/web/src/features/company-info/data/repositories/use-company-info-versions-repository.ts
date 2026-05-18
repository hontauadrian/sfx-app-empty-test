'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ListCompanyInfoVersionsResult } from '@sfx/domain';
import { COMPANY_INFO_VERSIONS_QUERY_KEY } from '../../constants';
import {
  fetchCompanyInfoVersions,
  type FetchCompanyInfoVersionsParams,
} from '../remote/fetch-company-info-versions';
import { mapToCompanyInfoVersionsPage } from '../mapper/map-to-company-info-version';
import type { CompanyInfoVersionsPageDataModel } from '../model/company-info-version-data-model';

export interface UseCompanyInfoVersionsRepositoryReturn {
  readonly versionsPageQuery: UseQueryResult<ListCompanyInfoVersionsResult, unknown>;
}

export function useCompanyInfoVersionsRepository(
  input: FetchCompanyInfoVersionsParams = {},
): UseCompanyInfoVersionsRepositoryReturn {
  const take = typeof input.take === 'number' ? input.take : null;
  const cursor = typeof input.cursor === 'string' && input.cursor.length > 0 ? input.cursor : null;

  const versionsPageQuery = useQuery({
    queryKey: [...COMPANY_INFO_VERSIONS_QUERY_KEY, take, cursor] as const,
    queryFn: (): Promise<CompanyInfoVersionsPageDataModel> => fetchCompanyInfoVersions(input),
    select: (data: CompanyInfoVersionsPageDataModel): ListCompanyInfoVersionsResult =>
      mapToCompanyInfoVersionsPage(data),
    retry: false,
  });

  return { versionsPageQuery };
}
