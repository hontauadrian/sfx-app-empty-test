'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { BrandGuidelinesVersion } from '@sfx/domain';
import { brandGuidelinesVersionQueryKey } from '../../constants';
import { fetchBrandGuidelinesVersionById } from '../remote/fetch-brand-guidelines-version-by-id';
import { mapToBrandGuidelinesVersion } from '../mapper/map-to-brand-guidelines-version';
import type { BrandGuidelinesVersionDataModel } from '../model/brand-guidelines-version-data-model';

export type UseBrandGuidelinesVersionRepositoryReturn = UseQueryResult<BrandGuidelinesVersion>;

export function useBrandGuidelinesVersionRepository(
  brandId: string,
  versionId: string,
): UseBrandGuidelinesVersionRepositoryReturn {
  return useQuery({
    queryKey: brandGuidelinesVersionQueryKey(brandId, versionId),
    queryFn: (): Promise<BrandGuidelinesVersionDataModel> =>
      fetchBrandGuidelinesVersionById(brandId, versionId),
    select: (data: BrandGuidelinesVersionDataModel): BrandGuidelinesVersion =>
      mapToBrandGuidelinesVersion(data),
    enabled: brandId.length > 0 && versionId.length > 0,
    retry: false,
  });
}
