import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { BRANDS_QUERY_KEY } from '../../constants';
import { deleteBrand } from '../remote/delete-brand';

export function useDeleteBrandMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => deleteBrand(id),
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY });
    },
  });
}
