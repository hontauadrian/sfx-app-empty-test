import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { BRANDS_QUERY_KEY } from '../../constants';
import { fetchBrands } from '../remote/fetch-brands';
import {
  mapToBrandProfile,
  type BrandProfile,
} from '../mapper/map-to-brand-profile';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

export function useBrandsRepository(): UseQueryResult<BrandProfile[]> {
  return useQuery({
    queryKey: BRANDS_QUERY_KEY,
    queryFn: fetchBrands,
    select: (data: BrandProfileDataModel[]) => data.map(mapToBrandProfile),
  });
}
