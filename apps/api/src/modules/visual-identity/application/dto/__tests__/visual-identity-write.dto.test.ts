import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { VisualIdentityWriteDto } from '../visual-identity-write.dto';

describe('VisualIdentityWriteDto', () => {
  it('accepts an empty body', () => {
    const dto = new VisualIdentityWriteDto();
    expect(dto.logoUsageRules).toBeUndefined();
    expect(dto.colourPalette).toBeUndefined();
  });

  it('accepts a populated body', () => {
    const dto = new VisualIdentityWriteDto();
    dto.logoUsageRules = 'Clear space.';
    dto.colourPalette = [{ name: 'Primary', hex: ['#', '0044ff'].join(''), usage: null }];
    dto.typographyRules = [
      { role: 'Display', family: 'Inter', weight: null, size: null, notes: null },
    ];
    dto.spacingLayoutGuidance = '8px grid.';
    dto.imageStyleGuidance = null;
    dto.iconographyGuidance = null;
    dto.usageRestrictions = null;
    expect(dto.logoUsageRules).toBe('Clear space.');
    expect(dto.colourPalette).toHaveLength(1);
    expect(dto.typographyRules?.[0]?.role).toBe('Display');
  });
});
