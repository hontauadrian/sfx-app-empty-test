'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { UpsertVisualIdentityInput, VisualIdentity } from '@sfx/domain';
import { visualIdentityQueryKey } from '../../constants';
import { fetchVisualIdentity } from '../remote/fetch-visual-identity';
import { updateVisualIdentity } from '../remote/update-visual-identity';
import {
  mapToVisualIdentity,
  mapToVisualIdentityOrNull,
} from '../mapper/map-to-visual-identity';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

export interface UseVisualIdentityRepositoryReturn {
  readonly visualQuery: UseQueryResult<VisualIdentity | null>;
  readonly updateMutation: UseMutationResult<
    VisualIdentity,
    unknown,
    UpsertVisualIdentityInput,
    unknown
  >;
}

export function useVisualIdentityRepository(
  brandId: string,
): UseVisualIdentityRepositoryReturn {
  const queryClient = useQueryClient();

  const visualQuery = useQuery({
    queryKey: visualIdentityQueryKey(brandId),
    queryFn: () => fetchVisualIdentity(brandId),
    select: (data: VisualIdentityDataModel | null): VisualIdentity | null =>
      mapToVisualIdentityOrNull(data),
    retry: false,
  });

  const updateMutation = useMutation<VisualIdentity, unknown, UpsertVisualIdentityInput>({
    mutationFn: async (input: UpsertVisualIdentityInput): Promise<VisualIdentity> => {
      const dto = await updateVisualIdentity(brandId, input);
      return mapToVisualIdentity(dto);
    },
    onSuccess: (saved: VisualIdentity): void => {
      queryClient.setQueryData(visualIdentityQueryKey(brandId), saved);
      void queryClient.invalidateQueries({
        queryKey: visualIdentityQueryKey(brandId),
        refetchType: 'none',
      });
    },
  });

  return { visualQuery, updateMutation };
}
