export interface VisualIdentityColorPaletteEntryDataModel {
  readonly name: string;
  readonly hex: string;
  readonly usageNotes: string | null;
}

export interface VisualIdentityTypographyEntryDataModel {
  readonly font: string;
  readonly weight: string;
  readonly usageContext: string | null;
}

export interface VisualIdentityDataModel {
  readonly brandId: string;
  readonly logoUsage: string;
  readonly colorPalette: readonly VisualIdentityColorPaletteEntryDataModel[];
  readonly typography: readonly VisualIdentityTypographyEntryDataModel[];
  readonly spacingGuidance: string;
  readonly imageStyleGuidance: string;
  readonly iconographyGuidance: string;
  readonly usageRestrictions: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
