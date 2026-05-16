import {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
  DOS_AND_DONT_CATEGORY_VALUES,
  type DosAndDontCategory,
} from '@sfx/validation';

export {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
  DOS_AND_DONT_CATEGORY_VALUES,
};
export type { DosAndDontCategory };

export const CONTENT_CHECK_ROUTE = '/content-check';
export const PICK_BRAND_ROUTE = '/';

export function addDosAndDontCtaHref(brandId: string): string {
  return `/brands/${brandId}`;
}
