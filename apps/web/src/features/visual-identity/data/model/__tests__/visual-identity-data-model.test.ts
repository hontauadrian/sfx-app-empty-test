import { describe, expect, it } from 'vitest';
import type {
  VisualIdentityColourPaletteEntryDataModel,
  VisualIdentityDataModel,
  VisualIdentityTypographyRuleDataModel,
} from '../visual-identity-data-model';

describe('VisualIdentityDataModel (type-only assertions)', () => {
  it('accepts a fully populated DTO payload', () => {
    const palette: VisualIdentityColourPaletteEntryDataModel = {
      name: 'Primary',
      hex: 'xxx',
      usage: 'Main.',
    };
    const typography: VisualIdentityTypographyRuleDataModel = {
      role: 'Display',
      family: 'Inter',
      weight: '700',
      size: '48px',
      notes: null,
    };
    const value: VisualIdentityDataModel = {
      id: 'vi-1',
      brandId: 'b-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [palette],
      typographyRules: [typography],
      spacingLayoutGuidance: '8px grid.',
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    expect(value.brandId).toBe('b-1');
    expect(value.colourPalette[0]).toBe(palette);
    expect(value.typographyRules[0]).toBe(typography);
  });

  it('accepts an empty-state envelope shape', () => {
    const value: VisualIdentityDataModel = {
      id: '',
      brandId: 'b-2',
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    expect(value.id).toBe('');
    expect(value.colourPalette).toEqual([]);
  });
});
