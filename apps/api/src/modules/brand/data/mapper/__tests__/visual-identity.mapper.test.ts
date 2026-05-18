import { describe, expect, it } from 'vitest';
import { toPrismaUpsertData, toVisualIdentity } from '../visual-identity.mapper';
import type { VisualIdentityRow } from '../visual-identity.mapper';

const baseRow: VisualIdentityRow = {
  brandId: 'clxbrand0001',
  logoUsage: 'Default usage',
  colorPalette: [{ name: 'Primary', hex: 'PrimaryHex', usageNotes: 'CTA' }] as unknown as VisualIdentityRow['colorPalette'],
  typography: [{ font: 'Inter', weight: '500', usageContext: 'Body' }] as unknown as VisualIdentityRow['typography'],
  spacingGuidance: '8px',
  imageStyleGuidance: 'Documentary',
  iconographyGuidance: 'Outlined',
  usageRestrictions: 'No shadow',
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T01:00:00.000Z'),
};

describe('toVisualIdentity', () => {
  it('maps a fully populated row to the domain entity', () => {
    const value = toVisualIdentity(baseRow);
    expect(value.brandId).toBe('clxbrand0001');
    expect(value.logoUsage).toBe('Default usage');
    expect(value.colorPalette).toHaveLength(1);
    expect(value.typography[0]?.font).toBe('Inter');
  });

  it('defaults Json list columns to empty arrays', () => {
    const row = {
      ...baseRow,
      colorPalette: null as unknown as VisualIdentityRow['colorPalette'],
      typography: null as unknown as VisualIdentityRow['typography'],
    };
    const value = toVisualIdentity(row);
    expect(value.colorPalette).toEqual([]);
    expect(value.typography).toEqual([]);
  });

  it('coerces nullable usageNotes / usageContext to null', () => {
    const row = {
      ...baseRow,
      colorPalette: [{ name: 'P', hex: 'H', usageNotes: undefined }] as unknown as VisualIdentityRow['colorPalette'],
      typography: [{ font: 'F', weight: 'W' }] as unknown as VisualIdentityRow['typography'],
    };
    const value = toVisualIdentity(row);
    expect(value.colorPalette[0]?.usageNotes).toBeNull();
    expect(value.typography[0]?.usageContext).toBeNull();
  });

  it('drops malformed Json entries', () => {
    const row = {
      ...baseRow,
      colorPalette: [
        { name: 'P', hex: 'H', usageNotes: null },
        { invalid: true },
      ] as unknown as VisualIdentityRow['colorPalette'],
    };
    const value = toVisualIdentity(row);
    expect(value.colorPalette).toHaveLength(1);
  });
});

describe('toPrismaUpsertData (visual)', () => {
  it('omits optional fields when not provided', () => {
    const data = toPrismaUpsertData({ logoUsage: 'Default' });
    expect(data.logoUsage).toBe('Default');
    expect(data.colorPalette).toBeUndefined();
    expect(data.typography).toBeUndefined();
  });

  it('converts every populated optional field', () => {
    const data = toPrismaUpsertData({
      logoUsage: 'Default',
      colorPalette: [{ name: 'P', hex: 'H', usageNotes: 'CTA' }],
      typography: [{ font: 'F', weight: '500', usageContext: 'Body' }],
      spacingGuidance: '8px',
      imageStyleGuidance: 'Doc',
      iconographyGuidance: 'Outlined',
      usageRestrictions: 'No shadow',
    });
    expect(data.colorPalette).toBeDefined();
    expect(data.typography).toBeDefined();
    expect(data.spacingGuidance).toBe('8px');
  });

  it('coerces null text fields to empty string', () => {
    const data = toPrismaUpsertData({
      logoUsage: 'Default',
      spacingGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    });
    expect(data.spacingGuidance).toBe('');
    expect(data.imageStyleGuidance).toBe('');
    expect(data.iconographyGuidance).toBe('');
    expect(data.usageRestrictions).toBe('');
  });
});
