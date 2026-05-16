import * as validation from '@sfx/validation';

export const VISUAL_IDENTITY_HEX_PATTERN = validation.VISUAL_IDENTITY_HEX_PATTERN;
export const VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH =
  validation.VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH;
export const VISUAL_IDENTITY_LIST_MAX_ITEMS = validation.VISUAL_IDENTITY_LIST_MAX_ITEMS;
export const VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH =
  validation.VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH;

export function visualIdentityEndpoint(brandId: string): string {
  return `api/v1/brands/${brandId}/visual-identity`;
}

export function visualIdentityQueryKey(brandId: string): readonly [string, string] {
  return ['visualIdentity', brandId] as const;
}

export function visualIdentityEditRoute(brandId: string): string {
  return `/brands/${brandId}/visual-identity/edit`;
}
