import { describe, expect, it } from 'vitest';
import {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
  contentCheckFormSchema,
  mapFormCategoryToWireCategory,
} from '../content-check.schema';
import { DOS_AND_DONT_CATEGORY_VALUES } from '../dos-and-donts.schema';

describe('contentCheckFormSchema', () => {
  it('parses defaults (empty pastedText, all-categories sentinel)', () => {
    const result = contentCheckFormSchema.safeParse({
      pastedText: '',
      category: CONTENT_CHECK_CATEGORY_ALL_VALUE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pastedText).toBe('');
      expect(result.data.category).toBe(CONTENT_CHECK_CATEGORY_ALL_VALUE);
    }
  });

  it.each(DOS_AND_DONT_CATEGORY_VALUES)(
    'parses each known category value: %s',
    (categoryValue) => {
      const result = contentCheckFormSchema.safeParse({
        pastedText: 'some content',
        category: categoryValue,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe(categoryValue);
      }
    },
  );

  it('rejects an unknown category enum value', () => {
    const result = contentCheckFormSchema.safeParse({
      pastedText: '',
      category: 'not-a-real-category',
    });
    expect(result.success).toBe(false);
  });

  it(`rejects pastedText longer than ${CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH} characters`, () => {
    const tooLong = 'x'.repeat(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH + 1);
    const result = contentCheckFormSchema.safeParse({
      pastedText: tooLong,
      category: CONTENT_CHECK_CATEGORY_ALL_VALUE,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        String(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH),
      );
    }
  });

  it(`accepts pastedText at exactly ${CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH} characters`, () => {
    const atCap = 'x'.repeat(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH);
    const result = contentCheckFormSchema.safeParse({
      pastedText: atCap,
      category: CONTENT_CHECK_CATEGORY_ALL_VALUE,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pastedText field', () => {
    const result = contentCheckFormSchema.safeParse({
      category: CONTENT_CHECK_CATEGORY_ALL_VALUE,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing category field', () => {
    const result = contentCheckFormSchema.safeParse({ pastedText: '' });
    expect(result.success).toBe(false);
  });
});

describe('mapFormCategoryToWireCategory', () => {
  it('maps the empty-string sentinel to undefined', () => {
    expect(mapFormCategoryToWireCategory(CONTENT_CHECK_CATEGORY_ALL_VALUE)).toBe(
      undefined,
    );
  });

  it.each(DOS_AND_DONT_CATEGORY_VALUES)(
    'maps each category value to itself: %s',
    (categoryValue) => {
      expect(mapFormCategoryToWireCategory(categoryValue)).toBe(categoryValue);
    },
  );
});
