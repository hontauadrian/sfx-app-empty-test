import type {
  VisualIdentity,
  VisualIdentityColourPaletteEntry,
  VisualIdentityTypographyRule,
} from '../entities/visual-identity';

export const VISUAL_IDENTITY_REPOSITORY = Symbol('VISUAL_IDENTITY_REPOSITORY');

export interface VisualIdentityWritePayload {
  readonly logoUsageRules: string | null;
  readonly colourPalette: readonly VisualIdentityColourPaletteEntry[];
  readonly typographyRules: readonly VisualIdentityTypographyRule[];
  readonly spacingLayoutGuidance: string | null;
  readonly imageStyleGuidance: string | null;
  readonly iconographyGuidance: string | null;
  readonly usageRestrictions: string | null;
}

export interface IVisualIdentityRepository {
  findByBrand(brandId: string, ownerSubject: string): Promise<VisualIdentity | null>;
  upsertForBrand(
    brandId: string,
    ownerSubject: string,
    payload: VisualIdentityWritePayload,
  ): Promise<VisualIdentity | null>;
}
