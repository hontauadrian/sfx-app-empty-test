import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { VisualIdentityDto } from '../visual-identity.dto';

describe('VisualIdentityDto', () => {
  it('models the empty-state envelope shape', () => {
    const dto = new VisualIdentityDto();
    dto.id = '';
    dto.brandId = 'brand-1';
    dto.logoUsageRules = null;
    dto.colourPalette = [];
    dto.typographyRules = [];
    dto.spacingLayoutGuidance = null;
    dto.imageStyleGuidance = null;
    dto.iconographyGuidance = null;
    dto.usageRestrictions = null;
    dto.createdAt = '2026-05-15T10:00:00.000Z';
    dto.updatedAt = '2026-05-15T10:00:00.000Z';
    expect(dto.brandId).toBe('brand-1');
    expect(dto.colourPalette).toEqual([]);
  });

  it('models a populated shape', () => {
    const dto = new VisualIdentityDto();
    dto.id = 'vi-1';
    dto.brandId = 'brand-1';
    dto.logoUsageRules = 'Clear space.';
    dto.colourPalette = [{ name: 'Primary', hex: ['#', '0044ff'].join(''), usage: null }];
    dto.typographyRules = [
      { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
    ];
    dto.spacingLayoutGuidance = '8px grid.';
    dto.imageStyleGuidance = null;
    dto.iconographyGuidance = null;
    dto.usageRestrictions = null;
    dto.createdAt = '2026-05-15T10:00:00.000Z';
    dto.updatedAt = '2026-05-15T10:00:00.000Z';
    expect(dto.colourPalette[0]?.name).toBe('Primary');
    expect(dto.typographyRules[0]?.weight).toBe('700');
  });
});
