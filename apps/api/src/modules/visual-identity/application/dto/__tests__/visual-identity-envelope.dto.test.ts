import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { VisualIdentityEnvelopeDto } from '../visual-identity-envelope.dto';
import { VisualIdentityDto } from '../visual-identity.dto';

describe('VisualIdentityEnvelopeDto', () => {
  it('wraps a VisualIdentityDto payload', () => {
    const inner = new VisualIdentityDto();
    inner.id = 'vi-1';
    inner.brandId = 'brand-1';
    inner.logoUsageRules = null;
    inner.colourPalette = [];
    inner.typographyRules = [];
    inner.spacingLayoutGuidance = null;
    inner.imageStyleGuidance = null;
    inner.iconographyGuidance = null;
    inner.usageRestrictions = null;
    inner.createdAt = '2026-05-15T10:00:00.000Z';
    inner.updatedAt = '2026-05-15T10:00:00.000Z';
    const env = new VisualIdentityEnvelopeDto();
    env.success = true;
    env.data = inner;
    expect(env.success).toBe(true);
    expect(env.data.brandId).toBe('brand-1');
  });
});
