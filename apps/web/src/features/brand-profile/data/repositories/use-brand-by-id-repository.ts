import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { brandQueryKey } from '../../constants';
import { fetchBrandById } from '../remote/fetch-brand-by-id';
import {
  mapToBrandProfile,
  type BrandProfile,
} from '../mapper/map-to-brand-profile';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

export function useBrandByIdRepository(
  id: string | null,
): UseQueryResult<BrandProfile> {
  return useQuery({
    queryKey: id ? brandQueryKey(id) : ['brands', '__noop__'],
    queryFn: () => fetchBrandById(id as string),
    select: (data: BrandProfileDataModel) => mapToBrandProfile(data),
    enabled: id !== null && id.length > 0,
  });
}
