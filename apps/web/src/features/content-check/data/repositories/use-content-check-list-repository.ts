import type { DosAndDontEntry } from '@sfx/domain';
import {
  mapFormCategoryToWireCategory,
  type ContentCheckCategoryValue,
} from '@sfx/validation';
import { useDosAndDontsRepository } from '@/features/dos-and-donts';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFoundError(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

export interface UseContentCheckListRepositoryReturn {
  readonly data: readonly DosAndDontEntry[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBrandNotFound: boolean;
}

export function useContentCheckListRepository(
  activeBrandId: string | null,
  formCategory: ContentCheckCategoryValue,
): UseContentCheckListRepositoryReturn {
  const wireCategory = mapFormCategoryToWireCategory(formCategory);
  const query = useDosAndDontsRepository(activeBrandId, wireCategory);

  const isBrandNotFound = query.isError && isNotFoundError(query.error);
  return {
    data: query.data as readonly DosAndDontEntry[] | undefined,
    isLoading: activeBrandId !== null && query.isLoading,
    isError: query.isError && !isBrandNotFound,
    isBrandNotFound,
  };
}
