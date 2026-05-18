import { describe, expect, it } from 'vitest';
import type { VisualIdentityDataModel } from '../visual-identity-data-model';

describe('VisualIdentityDataModel', () => {
  it('accepts a fully populated value', () => {
    const sample: VisualIdentityDataModel = {
      brandId: 'clxbrand0001',
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: 'PrimaryHex', usageNotes: null }],
      typography: [{ font: 'Inter', weight: '500', usageContext: null }],
      spacingGuidance: '',
      imageStyleGuidance: '',
      iconographyGuidance: '',
      usageRestrictions: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    };
    expect(sample.brandId).toBe('clxbrand0001');
    expect(sample.colorPalette[0]?.usageNotes).toBeNull();
  });
});
