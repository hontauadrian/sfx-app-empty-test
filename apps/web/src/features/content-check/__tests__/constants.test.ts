import { describe, expect, it } from 'vitest';
import {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
  CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
  CONTENT_CHECK_ROUTE,
  DOS_AND_DONT_CATEGORY_VALUES,
  PICK_BRAND_ROUTE,
  addDosAndDontCtaHref,
} from '../constants';

describe('content-check constants', () => {
  it('exposes the route constants', () => {
    expect(CONTENT_CHECK_ROUTE).toBe('/content-check');
    expect(PICK_BRAND_ROUTE).toBe('/');
  });

  it('re-exports the F1 enum and content-check schema constants', () => {
    expect(CONTENT_CHECK_CATEGORY_ALL_VALUE).toBe('');
    expect(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH).toBe(10000);
    expect(DOS_AND_DONT_CATEGORY_VALUES).toEqual([
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ]);
  });

  it('builds the brand-overview href for the zero-matches CTA', () => {
    expect(addDosAndDontCtaHref('brand-123')).toBe('/brands/brand-123');
  });
});
