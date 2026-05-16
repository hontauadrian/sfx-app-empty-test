import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { visualIdentityQueryKey } from '../../constants';
import {
  upsertVisualIdentity,
  type UpsertVisualIdentityInput,
} from '../remote/upsert-visual-identity';
import {
  mapToVisualIdentity,
  type VisualIdentity,
} from '../mapper/map-to-visual-identity';

export function useUpsertVisualIdentityMutation(
  brandId: string,
): UseMutationResult<VisualIdentity | null, Error, UpsertVisualIdentityInput['payload']> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: UpsertVisualIdentityInput['payload'],
    ): Promise<VisualIdentity | null> => {
      const data = await upsertVisualIdentity({ brandId, payload });
      return mapToVisualIdentity(data);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({
        queryKey: visualIdentityQueryKey(brandId),
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });
}
