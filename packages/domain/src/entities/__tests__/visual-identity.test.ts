import { describe, expect, it } from 'vitest';
import type {
  UpsertVisualIdentityInput,
  VisualIdentity,
  VisualIdentityColorPaletteEntry,
  VisualIdentityTypographyEntry,
} from '../visual-identity';

describe('VisualIdentity entity types', () => {
  it('accepts a fully populated value with every field present', () => {
    const palette: VisualIdentityColorPaletteEntry = {
      name: 'Primary',
      hex: '#1A2B3C',
      usageNotes: 'CTA buttons',
    };
    const type: VisualIdentityTypographyEntry = {
      font: 'Inter',
      weight: '500',
      usageContext: 'Body copy',
    };
    const sample: VisualIdentity = {
      brandId: 'clxbrand0001',
      logoUsage: 'Always full-color on white.',
      colorPalette: [palette],
      typography: [type],
      spacingGuidance: 'Use 8px grid.',
      imageStyleGuidance: 'Documentary realism.',
      iconographyGuidance: 'Outlined, 24px.',
      usageRestrictions: 'No drop shadow.',
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    };
    expect(sample.brandId).toBe('clxbrand0001');
    expect(sample.colorPalette[0]?.hex).toBe('#1A2B3C');
    expect(sample.typography[0]?.font).toBe('Inter');
    expect(sample.usageRestrictions).toBe('No drop shadow.');
  });

  it('accepts a minimally populated value with empty list defaults', () => {
    const sample: VisualIdentity = {
      brandId: 'clxbrand0002',
      logoUsage: 'Default usage.',
      colorPalette: [],
      typography: [],
      spacingGuidance: '',
      imageStyleGuidance: '',
      iconographyGuidance: '',
      usageRestrictions: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(sample.colorPalette).toEqual([]);
    expect(sample.spacingGuidance).toBe('');
  });

  it('allows nullable usageNotes / usageContext', () => {
    const palette: VisualIdentityColorPaletteEntry = {
      name: 'Accent',
      hex: '#fff',
      usageNotes: null,
    };
    const type: VisualIdentityTypographyEntry = {
      font: 'Inter',
      weight: '700',
      usageContext: null,
    };
    expect(palette.usageNotes).toBeNull();
    expect(type.usageContext).toBeNull();
  });

  it('UpsertVisualIdentityInput accepts only required logoUsage', () => {
    const input: UpsertVisualIdentityInput = { logoUsage: 'Light bg only.' };
    expect(input.logoUsage).toBe('Light bg only.');
  });

  it('UpsertVisualIdentityInput accepts every optional list and text', () => {
    const input: UpsertVisualIdentityInput = {
      logoUsage: 'Full color',
      colorPalette: [{ name: 'Primary', hex: '#000', usageNotes: 'CTA' }],
      typography: [{ font: 'Inter', weight: '400', usageContext: null }],
      spacingGuidance: '8px grid',
      imageStyleGuidance: null,
      iconographyGuidance: 'Outlined',
      usageRestrictions: null,
    };
    expect(input.colorPalette?.[0]?.hex).toBe('#000');
    expect(input.imageStyleGuidance).toBeNull();
  });
});
