import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { BRANDS_QUERY_KEY } from '../../constants';
import { createBrand, type CreateBrandInput } from '../remote/create-brand';
import {
  mapToBrandProfile,
  type BrandProfile,
} from '../mapper/map-to-brand-profile';

export function useCreateBrandMutation(): UseMutationResult<
  BrandProfile,
  Error,
  CreateBrandInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBrandInput): Promise<BrandProfile> => {
      const data = await createBrand(input);
      return mapToBrandProfile(data);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY });
    },
  });
}
