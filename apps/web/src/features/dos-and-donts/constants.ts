import * as validation from '@sfx/validation';
import type { DosAndDontCategory } from '@sfx/validation';

export const DOS_AND_DONT_TYPE_VALUES = validation.DOS_AND_DONT_TYPE_VALUES;
export const DOS_AND_DONT_CATEGORY_VALUES = validation.DOS_AND_DONT_CATEGORY_VALUES;
export const DOS_AND_DONT_TITLE_MAX_LENGTH = validation.DOS_AND_DONT_TITLE_MAX_LENGTH;
export const DOS_AND_DONT_BODY_MAX_LENGTH = validation.DOS_AND_DONT_BODY_MAX_LENGTH;

export const DOS_AND_DONTS_ROOT_QUERY_KEY = 'dos-and-donts' as const;

export function dosAndDontsEndpoint(brandId: string): string {
  return `api/v1/brands/${brandId}/dos-and-donts`;
}

export function dosAndDontEntryEndpoint(brandId: string, entryId: string): string {
  return `${dosAndDontsEndpoint(brandId)}/${entryId}`;
}

export function dosAndDontsListQueryKey(
  brandId: string,
  category?: DosAndDontCategory,
): readonly unknown[] {
  return category
    ? ([DOS_AND_DONTS_ROOT_QUERY_KEY, brandId, category] as const)
    : ([DOS_AND_DONTS_ROOT_QUERY_KEY, brandId] as const);
}

export function dosAndDontEntryQueryKey(
  brandId: string,
  entryId: string,
): readonly [typeof DOS_AND_DONTS_ROOT_QUERY_KEY, string, 'entry', string] {
  return [DOS_AND_DONTS_ROOT_QUERY_KEY, brandId, 'entry', entryId] as const;
}

export function dosAndDontNewRoute(brandId: string): string {
  return `/brands/${brandId}/dos-and-donts/new`;
}

export function dosAndDontEditRoute(brandId: string, entryId: string): string {
  return `/brands/${brandId}/dos-and-donts/${entryId}/edit`;
}
