import { describe, expect, it } from 'vitest';
import type {
  VisualIdentity,
  VisualIdentityColourPaletteEntry,
  VisualIdentityTypographyRule,
} from '../visual-identity';

describe('VisualIdentity types', () => {
  it('accepts a fully-populated value', () => {
    const palette: VisualIdentityColourPaletteEntry = {
      name: 'Primary',
      hex: '#0044ff',
      usage: 'Main brand colour.',
    };
    const typography: VisualIdentityTypographyRule = {
      role: 'Display',
      family: 'Inter',
      weight: '700',
      size: '48px',
      notes: null,
    };
    const value: VisualIdentity = {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [palette],
      typographyRules: [typography],
      spacingLayoutGuidance: '8px grid.',
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    expect(value.brandId).toBe('brand-1');
    expect(value.colourPalette[0].hex).toBe('#0044ff');
    expect(value.typographyRules[0].role).toBe('Display');
  });

  it('accepts an empty-state value', () => {
    const value: VisualIdentity = {
      id: '',
      brandId: 'brand-1',
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: null,
      updatedAt: null,
    };
    expect(value.id).toBe('');
    expect(value.colourPalette).toEqual([]);
  });
});
