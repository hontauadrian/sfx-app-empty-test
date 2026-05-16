import { z } from 'zod';
import '../openapi';
import {
  DOS_AND_DONT_CATEGORY_VALUES,
  type DosAndDontCategory,
} from './dos-and-donts.schema';

export const CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH = 10000;
export const CONTENT_CHECK_CATEGORY_ALL_VALUE = '' as const;

export type ContentCheckCategoryValue =
  | typeof CONTENT_CHECK_CATEGORY_ALL_VALUE
  | DosAndDontCategory;

const categoryValues = [
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  ...DOS_AND_DONT_CATEGORY_VALUES,
] as const;

const pastedTextField = z
  .string()
  .max(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH, {
    message: `Pasted text must be at most ${CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH} characters`,
  })
  .openapi({
    example: 'Some marketing copy to validate against brand dos and donts.',
    description: `Pasted content to manually check. Local-only — never sent to the server. Capped at ${CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH} characters as a defensive bound.`,
  });

const categoryField = z.enum(categoryValues).openapi({
  example: CONTENT_CHECK_CATEGORY_ALL_VALUE,
  description: `Category filter. Empty string ('') means "all categories"; non-empty values are one of: ${DOS_AND_DONT_CATEGORY_VALUES.join(', ')}.`,
});

export const contentCheckFormSchema = z
  .object({
    pastedText: pastedTextField,
    category: categoryField,
  })
  .openapi({ description: 'Client-side schema for the /content-check form' });

export type ContentCheckFormInput = z.infer<typeof contentCheckFormSchema>;

export function mapFormCategoryToWireCategory(
  formValue: ContentCheckCategoryValue,
): DosAndDontCategory | undefined {
  return formValue === CONTENT_CHECK_CATEGORY_ALL_VALUE ? undefined : formValue;
}
