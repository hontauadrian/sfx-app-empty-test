import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { DOS_AND_DONTS_ROOT_QUERY_KEY } from '../../constants';
import { deleteDosAndDont } from '../remote/delete-dos-and-dont';

export function useDeleteDosAndDontMutation(
  brandId: string,
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string): Promise<void> => {
      await deleteDosAndDont({ brandId, entryId });
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({
        queryKey: [DOS_AND_DONTS_ROOT_QUERY_KEY, brandId],
      });
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });
}
