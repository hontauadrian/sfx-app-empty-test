import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DosAndDontCategory } from '@sfx/validation';
import { dosAndDontsListQueryKey } from '../../constants';
import { fetchDosAndDonts } from '../remote/fetch-dos-and-donts';
import { mapToDosAndDont, type DosAndDont } from '../mapper/map-to-dos-and-dont';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

export function useDosAndDontsRepository(
  brandId: string | null,
  category?: DosAndDontCategory,
): UseQueryResult<DosAndDont[]> {
  return useQuery({
    queryKey: brandId
      ? dosAndDontsListQueryKey(brandId, category)
      : ['dos-and-donts', '__noop__'],
    queryFn: () => fetchDosAndDonts({ brandId: brandId as string, category }),
    select: (data: DosAndDontDataModel[]) => data.map(mapToDosAndDont),
    enabled: brandId !== null && brandId.length > 0,
  });
}
