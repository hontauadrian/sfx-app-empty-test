'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CompanyInfoVersion } from '@sfx/domain';
import { COMPANY_INFO_VERSION_QUERY_KEY } from '../../constants';
import { fetchCompanyInfoVersionById } from '../remote/fetch-company-info-version-by-id';
import { mapToCompanyInfoVersion } from '../mapper/map-to-company-info-version';
import type { CompanyInfoVersionDataModel } from '../model/company-info-version-data-model';

export interface UseCompanyInfoVersionRepositoryReturn {
  readonly versionQuery: UseQueryResult<CompanyInfoVersion, unknown>;
}

export function useCompanyInfoVersionRepository(
  id: string,
): UseCompanyInfoVersionRepositoryReturn {
  const versionQuery = useQuery({
    queryKey: COMPANY_INFO_VERSION_QUERY_KEY(id),
    queryFn: (): Promise<CompanyInfoVersionDataModel> => fetchCompanyInfoVersionById(id),
    select: (data: CompanyInfoVersionDataModel): CompanyInfoVersion => mapToCompanyInfoVersion(data),
    retry: false,
    enabled: id.length > 0,
  });

  return { versionQuery };
}
