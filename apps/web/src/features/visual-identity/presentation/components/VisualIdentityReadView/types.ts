import type { VisualIdentity } from '../../../data/mapper/map-to-visual-identity';

export interface VisualIdentityReadViewLabels {
  readonly logoUsageRulesLabel: string;
  readonly colourPaletteLabel: string;
  readonly typographyRulesLabel: string;
  readonly spacingLayoutGuidanceLabel: string;
  readonly imageStyleGuidanceLabel: string;
  readonly iconographyGuidanceLabel: string;
  readonly usageRestrictionsLabel: string;
  readonly colourPaletteNameLabel: string;
  readonly colourPaletteHexLabel: string;
  readonly colourPaletteUsageLabel: string;
  readonly typographyRoleLabel: string;
  readonly typographyFamilyLabel: string;
  readonly typographyWeightLabel: string;
  readonly typographySizeLabel: string;
  readonly typographyNotesLabel: string;
}

export interface VisualIdentityReadViewProps {
  readonly identity: VisualIdentity;
  readonly labels: VisualIdentityReadViewLabels;
}
