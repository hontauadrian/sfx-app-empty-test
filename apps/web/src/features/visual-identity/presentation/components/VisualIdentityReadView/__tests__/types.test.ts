import { describe, expect, it } from 'vitest';
import type {
  VisualIdentityReadViewLabels,
  VisualIdentityReadViewProps,
} from '../types';
import type { VisualIdentity } from '../../../../data/mapper/map-to-visual-identity';

describe('VisualIdentityReadViewProps', () => {
  it('accepts a populated identity + labels', () => {
    const labels: VisualIdentityReadViewLabels = {
      logoUsageRulesLabel: 'a',
      colourPaletteLabel: 'b',
      typographyRulesLabel: 'c',
      spacingLayoutGuidanceLabel: 'd',
      imageStyleGuidanceLabel: 'e',
      iconographyGuidanceLabel: 'f',
      usageRestrictionsLabel: 'g',
      colourPaletteNameLabel: 'h',
      colourPaletteHexLabel: 'i',
      colourPaletteUsageLabel: 'j',
      typographyRoleLabel: 'k',
      typographyFamilyLabel: 'l',
      typographyWeightLabel: 'm',
      typographySizeLabel: 'n',
      typographyNotesLabel: 'o',
    };
    const identity: VisualIdentity = {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    const props: VisualIdentityReadViewProps = { identity, labels };
    expect(props.identity.brandId).toBe('brand-1');
    expect(props.labels.colourPaletteLabel).toBe('b');
  });
});
