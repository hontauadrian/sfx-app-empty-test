import type {
  VisualIdentityColourPaletteEntryDataModel,
  VisualIdentityDataModel,
  VisualIdentityTypographyRuleDataModel,
} from '../model/visual-identity-data-model';

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
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapPaletteEntry(
  entry: VisualIdentityColourPaletteEntryDataModel,
): VisualIdentityColourPaletteEntry {
  return { name: entry.name, hex: entry.hex, usage: entry.usage };
}

function mapTypographyRule(
  entry: VisualIdentityTypographyRuleDataModel,
): VisualIdentityTypographyRule {
  return {
    role: entry.role,
    family: entry.family,
    weight: entry.weight,
    size: entry.size,
    notes: entry.notes,
  };
}

export function mapToVisualIdentity(data: VisualIdentityDataModel): VisualIdentity | null {
  if (data.id === '') return null;
  return {
    id: data.id,
    brandId: data.brandId,
    logoUsageRules: data.logoUsageRules,
    colourPalette: data.colourPalette.map(mapPaletteEntry),
    typographyRules: data.typographyRules.map(mapTypographyRule),
    spacingLayoutGuidance: data.spacingLayoutGuidance,
    imageStyleGuidance: data.imageStyleGuidance,
    iconographyGuidance: data.iconographyGuidance,
    usageRestrictions: data.usageRestrictions,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}
