import { describe, expect, it } from 'vitest';
import { mapToVisualIdentity } from '../map-to-visual-identity';

const NOW_ISO = '2026-05-15T00:00:00.000Z';

describe('mapToVisualIdentity', () => {
  it('returns null when the envelope reports the empty-state sentinel id', () => {
    const result = mapToVisualIdentity({
      id: '',
      brandId: 'brand-1',
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    expect(result).toBeNull();
  });

  it('coerces ISO timestamps to Date and maps list shapes', () => {
    const result = mapToVisualIdentity({
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'Main.' }],
      typographyRules: [
        { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
      ],
      spacingLayoutGuidance: '8px',
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: NOW_ISO,
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    expect(result).not.toBeNull();
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.updatedAt).toBeInstanceOf(Date);
    expect(result?.colourPalette[0]?.name).toBe('Primary');
    expect(result?.typographyRules[0]?.weight).toBe('700');
  });
});
