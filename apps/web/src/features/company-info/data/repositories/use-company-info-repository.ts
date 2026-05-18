'use client';

import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { CompanyInfo, UpsertCompanyInfoInput } from '@sfx/domain';
import { COMPANY_INFO_QUERY_KEY } from '../../constants';
import { fetchCompanyInfo } from '../remote/fetch-company-info';
import { updateCompanyInfo } from '../remote/update-company-info';
import { mapToCompanyInfo, mapToCompanyInfoOrNull } from '../mapper/map-to-company-info';
import type { CompanyInfoDataModel } from '../model/company-info-data-model';

export interface UseCompanyInfoRepositoryReturn {
  readonly companyInfoQuery: UseQueryResult<CompanyInfo | null>;
  readonly upsertMutation: UseMutationResult<CompanyInfo, unknown, UpsertCompanyInfoInput, unknown>;
}

export function useCompanyInfoRepository(): UseCompanyInfoRepositoryReturn {
  const queryClient = useQueryClient();

  const companyInfoQuery = useQuery({
    queryKey: COMPANY_INFO_QUERY_KEY,
    queryFn: fetchCompanyInfo,
    select: (data: CompanyInfoDataModel | null): CompanyInfo | null => mapToCompanyInfoOrNull(data),
    retry: false,
  });

  const upsertMutation = useMutation<CompanyInfo, unknown, UpsertCompanyInfoInput>({
    mutationFn: async (input: UpsertCompanyInfoInput): Promise<CompanyInfo> => {
      const dto = await updateCompanyInfo(input);
      return mapToCompanyInfo(dto);
    },
    onSuccess: (saved: CompanyInfo): void => {
      queryClient.setQueryData(COMPANY_INFO_QUERY_KEY, saved);
      void queryClient.invalidateQueries({ queryKey: COMPANY_INFO_QUERY_KEY, refetchType: 'none' });
    },
  });

  return { companyInfoQuery, upsertMutation };
}
