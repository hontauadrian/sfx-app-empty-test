import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { DOS_AND_DONTS_ROOT_QUERY_KEY } from '../../constants';
import {
  createDosAndDont,
  type CreateDosAndDontInput,
} from '../remote/create-dos-and-dont';
import { mapToDosAndDont, type DosAndDont } from '../mapper/map-to-dos-and-dont';

export function useCreateDosAndDontMutation(
  brandId: string,
): UseMutationResult<DosAndDont, Error, CreateDosAndDontInput['payload']> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: CreateDosAndDontInput['payload'],
    ): Promise<DosAndDont> => {
      const data = await createDosAndDont({ brandId, payload });
      return mapToDosAndDont(data);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({
        queryKey: [DOS_AND_DONTS_ROOT_QUERY_KEY, brandId],
      });
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });
}
