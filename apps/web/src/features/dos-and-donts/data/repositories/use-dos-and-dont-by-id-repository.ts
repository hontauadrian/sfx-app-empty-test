import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { dosAndDontEntryQueryKey } from '../../constants';
import { fetchDosAndDontById } from '../remote/fetch-dos-and-dont-by-id';
import { mapToDosAndDont, type DosAndDont } from '../mapper/map-to-dos-and-dont';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

export function useDosAndDontByIdRepository(
  brandId: string | null,
  entryId: string | null,
): UseQueryResult<DosAndDont> {
  return useQuery({
    queryKey:
      brandId && entryId
        ? dosAndDontEntryQueryKey(brandId, entryId)
        : ['dos-and-donts', '__noop__'],
    queryFn: () =>
      fetchDosAndDontById({ brandId: brandId as string, entryId: entryId as string }),
    select: (data: DosAndDontDataModel) => mapToDosAndDont(data),
    enabled:
      brandId !== null && brandId.length > 0 && entryId !== null && entryId.length > 0,
  });
}
