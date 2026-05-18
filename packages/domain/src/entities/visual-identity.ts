// Visual Identity — per-brand singleton sub-resource.
//
// Uniquely keyed by `brandId` (1:0..1 with `Brand`). Lists default to
// empty arrays at the data-mapper boundary; optional text fields are
// stored as `""` when the client omits them.

export interface VisualIdentityColorPaletteEntry {
  readonly name: string;
  readonly hex: string;
  readonly usageNotes: string | null;
}

export interface VisualIdentityTypographyEntry {
  readonly font: string;
  readonly weight: string;
  readonly usageContext: string | null;
}

export interface VisualIdentity {
  readonly brandId: string;
  readonly logoUsage: string;
  readonly colorPalette: readonly VisualIdentityColorPaletteEntry[];
  readonly typography: readonly VisualIdentityTypographyEntry[];
  readonly spacingGuidance: string;
  readonly imageStyleGuidance: string;
  readonly iconographyGuidance: string;
  readonly usageRestrictions: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertVisualIdentityColorPaletteEntryInput {
  readonly name: string;
  readonly hex: string;
  readonly usageNotes?: string | null;
}

export interface UpsertVisualIdentityTypographyEntryInput {
  readonly font: string;
  readonly weight: string;
  readonly usageContext?: string | null;
}

export interface UpsertVisualIdentityInput {
  readonly logoUsage: string;
  readonly colorPalette?: readonly UpsertVisualIdentityColorPaletteEntryInput[];
  readonly typography?: readonly UpsertVisualIdentityTypographyEntryInput[];
  readonly spacingGuidance?: string | null;
  readonly imageStyleGuidance?: string | null;
  readonly iconographyGuidance?: string | null;
  readonly usageRestrictions?: string | null;
}
