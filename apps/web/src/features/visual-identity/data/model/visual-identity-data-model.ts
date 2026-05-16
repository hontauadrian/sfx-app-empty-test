export interface VisualIdentityColourPaletteEntryDataModel {
  readonly name: string;
  readonly hex: string;
  readonly usage: string | null;
}

export interface VisualIdentityTypographyRuleDataModel {
  readonly role: string;
  readonly family: string;
  readonly weight: string | null;
  readonly size: string | null;
  readonly notes: string | null;
}

export interface VisualIdentityDataModel {
  readonly id: string;
  readonly brandId: string;
  readonly logoUsageRules: string | null;
  readonly colourPalette: readonly VisualIdentityColourPaletteEntryDataModel[];
  readonly typographyRules: readonly VisualIdentityTypographyRuleDataModel[];
  readonly spacingLayoutGuidance: string | null;
  readonly imageStyleGuidance: string | null;
  readonly iconographyGuidance: string | null;
  readonly usageRestrictions: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
