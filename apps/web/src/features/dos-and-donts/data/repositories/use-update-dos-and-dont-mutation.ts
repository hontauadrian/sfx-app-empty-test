import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  DOS_AND_DONTS_ROOT_QUERY_KEY,
  dosAndDontEntryQueryKey,
} from '../../constants';
import {
  updateDosAndDont,
  type UpdateDosAndDontInput,
} from '../remote/update-dos-and-dont';
import { mapToDosAndDont, type DosAndDont } from '../mapper/map-to-dos-and-dont';

export interface UpdateDosAndDontVariables {
  readonly entryId: string;
  readonly payload: UpdateDosAndDontInput['payload'];
}

export function useUpdateDosAndDontMutation(
  brandId: string,
): UseMutationResult<DosAndDont, Error, UpdateDosAndDontVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      variables: UpdateDosAndDontVariables,
    ): Promise<DosAndDont> => {
      const data = await updateDosAndDont({
        brandId,
        entryId: variables.entryId,
        payload: variables.payload,
      });
      return mapToDosAndDont(data);
    },
    onSettled: (_data, _error, variables): void => {
      void queryClient.invalidateQueries({
        queryKey: [DOS_AND_DONTS_ROOT_QUERY_KEY, brandId],
      });
      void queryClient.invalidateQueries({
        queryKey: dosAndDontEntryQueryKey(brandId, variables.entryId),
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });
}
