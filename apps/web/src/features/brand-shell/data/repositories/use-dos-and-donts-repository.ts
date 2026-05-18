'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { DosDontsEntry } from '@sfx/domain';
import { dosAndDontsQueryKey } from '../../constants';
import { mapToDosDontsEntry, mapToDosDontsEntryList } from '../mapper/map-to-dos-donts-entry';
import {
  createDosDontsEntry,
  type CreateDosDontsEntryInput,
} from '../remote/create-dos-donts-entry';
import {
  deleteDosDontsEntry,
  type DeleteDosDontsEntryInput,
} from '../remote/delete-dos-donts-entry';
import {
  fetchDosAndDonts,
  type FetchDosAndDontsParams,
} from '../remote/fetch-dos-and-donts';
import {
  updateDosDontsEntry,
  type UpdateDosDontsEntryInput,
} from '../remote/update-dos-donts-entry';
import type { DosDontsEntryDataModel } from '../model/dos-donts-entry-data-model';

export interface UseDosAndDontsRepositoryReturn {
  readonly listQuery: UseQueryResult<readonly DosDontsEntry[]>;
  readonly createMutation: UseMutationResult<DosDontsEntry, unknown, Omit<CreateDosDontsEntryInput, 'brandId'>, unknown>;
  readonly updateMutation: UseMutationResult<DosDontsEntry, unknown, Omit<UpdateDosDontsEntryInput, 'brandId'>, unknown>;
  readonly deleteMutation: UseMutationResult<void, unknown, Omit<DeleteDosDontsEntryInput, 'brandId'>, unknown>;
}

export function useDosAndDontsRepository(
  params: FetchDosAndDontsParams,
): UseDosAndDontsRepositoryReturn {
  const queryClient = useQueryClient();
  const baseQueryKey = dosAndDontsQueryKey(params.brandId);
  const filteredQueryKey = dosAndDontsQueryKey(params.brandId, {
    type: params.type,
    category: params.category,
  });

  const listQuery = useQuery({
    queryKey: filteredQueryKey,
    queryFn: () => fetchDosAndDonts(params),
    select: (data: readonly DosDontsEntryDataModel[]): readonly DosDontsEntry[] =>
      mapToDosDontsEntryList(data),
    retry: false,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: baseQueryKey });
  };

  const createMutation = useMutation<
    DosDontsEntry,
    unknown,
    Omit<CreateDosDontsEntryInput, 'brandId'>
  >({
    mutationFn: async (input) =>
      mapToDosDontsEntry(await createDosDontsEntry({ ...input, brandId: params.brandId })),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation<
    DosDontsEntry,
    unknown,
    Omit<UpdateDosDontsEntryInput, 'brandId'>
  >({
    mutationFn: async (input) =>
      mapToDosDontsEntry(await updateDosDontsEntry({ ...input, brandId: params.brandId })),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation<
    void,
    unknown,
    Omit<DeleteDosDontsEntryInput, 'brandId'>
  >({
    mutationFn: async (input) => {
      await deleteDosDontsEntry({ ...input, brandId: params.brandId });
    },
    onSuccess: invalidate,
  });

  return { listQuery, createMutation, updateMutation, deleteMutation };
}
