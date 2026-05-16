import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { visualIdentityQueryKey } from '../../constants';
import { fetchVisualIdentity } from '../remote/fetch-visual-identity';
import {
  mapToVisualIdentity,
  type VisualIdentity,
} from '../mapper/map-to-visual-identity';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

export function useVisualIdentityRepository(
  brandId: string | null,
): UseQueryResult<VisualIdentity | null> {
  return useQuery({
    queryKey: brandId
      ? visualIdentityQueryKey(brandId)
      : ['visualIdentity', '__noop__'],
    queryFn: () => fetchVisualIdentity(brandId as string),
    select: (data: VisualIdentityDataModel) => mapToVisualIdentity(data),
    enabled: brandId !== null && brandId.length > 0,
  });
}
