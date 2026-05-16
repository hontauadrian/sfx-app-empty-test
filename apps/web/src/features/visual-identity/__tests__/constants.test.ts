import { describe, expect, it } from 'vitest';
import {
  VISUAL_IDENTITY_HEX_PATTERN,
  VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH,
  VISUAL_IDENTITY_LIST_MAX_ITEMS,
  VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH,
  visualIdentityEditRoute,
  visualIdentityEndpoint,
  visualIdentityQueryKey,
} from '../constants';

describe('visual-identity constants', () => {
  it('re-exports the validation constants', () => {
    expect(VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH).toBe(4000);
    expect(VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH).toBe(120);
    expect(VISUAL_IDENTITY_LIST_MAX_ITEMS).toBe(50);
    expect(VISUAL_IDENTITY_HEX_PATTERN).toBeInstanceOf(RegExp);
  });

  it('produces the expected endpoint, query key, and edit route', () => {
    expect(visualIdentityEndpoint('brand-1')).toBe(
      'api/v1/brands/brand-1/visual-identity',
    );
    expect(visualIdentityQueryKey('brand-1')).toEqual(['visualIdentity', 'brand-1']);
    expect(visualIdentityEditRoute('brand-1')).toBe(
      '/brands/brand-1/visual-identity/edit',
    );
  });
});
