export interface VisualIdentityColourPaletteEntry {
  readonly name: string;
  readonly hex: string;
  readonly usage: string | null;
}

export interface VisualIdentityTypographyRule {
  readonly role: string;
  readonly family: string;
  readonly weight: string | null;
  readonly size: string | null;
  readonly notes: string | null;
}

export interface VisualIdentity {
  readonly id: string;
  readonly brandId: string;
  readonly logoUsageRules: string | null;
  readonly colourPalette: readonly VisualIdentityColourPaletteEntry[];
  readonly typographyRules: readonly VisualIdentityTypographyRule[];
  readonly spacingLayoutGuidance: string | null;
  readonly imageStyleGuidance: string | null;
  readonly iconographyGuidance: string | null;
  readonly usageRestrictions: string | null;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}
