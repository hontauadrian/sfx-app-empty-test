import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { BRANDS_QUERY_KEY } from '../../constants';
import { updateBrand, type UpdateBrandInput } from '../remote/update-brand';
import {
  mapToBrandProfile,
  type BrandProfile,
} from '../mapper/map-to-brand-profile';

export function useUpdateBrandMutation(): UseMutationResult<
  BrandProfile,
  Error,
  UpdateBrandInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBrandInput): Promise<BrandProfile> => {
      const data = await updateBrand(input);
      return mapToBrandProfile(data);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY });
    },
  });
}
