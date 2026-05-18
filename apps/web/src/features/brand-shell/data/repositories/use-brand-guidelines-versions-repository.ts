'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  BrandGuidelinesVersion,
  ListBrandGuidelinesVersionsResult,
} from '@sfx/domain';
import { brandGuidelinesVersionsQueryKey } from '../../constants';
import { fetchBrandGuidelinesVersions } from '../remote/fetch-brand-guidelines-versions';
import { mapToBrandGuidelinesVersionsPage } from '../mapper/map-to-brand-guidelines-version';
import type { BrandGuidelinesVersionsPageDataModel } from '../model/brand-guidelines-version-data-model';

export interface UseBrandGuidelinesVersionsRepositoryInput {
  readonly take?: number;
  readonly cursor?: string;
}

export type UseBrandGuidelinesVersionsRepositoryReturn = UseQueryResult<{
  readonly items: readonly BrandGuidelinesVersion[];
  readonly nextCursor: string | null;
}>;

export function useBrandGuidelinesVersionsRepository(
  brandId: string,
  input: UseBrandGuidelinesVersionsRepositoryInput = {},
): UseBrandGuidelinesVersionsRepositoryReturn {
  return useQuery({
    queryKey: [
      ...brandGuidelinesVersionsQueryKey(brandId),
      input.take ?? null,
      input.cursor ?? null,
    ],
    queryFn: (): Promise<BrandGuidelinesVersionsPageDataModel> =>
      fetchBrandGuidelinesVersions(brandId, input),
    select: (
      data: BrandGuidelinesVersionsPageDataModel,
    ): ListBrandGuidelinesVersionsResult => mapToBrandGuidelinesVersionsPage(data),
    enabled: brandId.length > 0,
    retry: false,
  });
}
